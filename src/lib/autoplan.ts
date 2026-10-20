/**
 * Génération automatique d'une semaine de planning.
 *
 * Principe : on part d'un « squelette » de créneaux horaires sans nom (la
 * semaine type du cabinet, ou les créneaux d'une semaine de référence), et on
 * cherche l'affectation des personnes qui respecte les contraintes dures
 * (absences, une personne par créneau, pas deux créneaux en même temps) tout
 * en minimisant un score de pénalités :
 *
 *   - écart entre les heures planifiées et la cible de chacune (contrat au
 *     prorata des absences, corrigé en douceur par le cumul annuel) ;
 *   - demi-journées isolées : on préfère qu'une personne fasse le matin ET
 *     l'après-midi du même jour, pour ne pas perdre d'information entre les
 *     deux demi-journées ;
 *   - samedis trop rapprochés pour une même personne ;
 *   - créneau laissé vide (très pénalisé).
 *
 * La recherche est un recuit simulé : petit problème (quelques personnes,
 * une vingtaine de créneaux), quelques milliers d'itérations suffisent et
 * tournent instantanément dans le navigateur. Le résultat dépend d'une graine
 * : « Regénérer » change la graine pour proposer une autre variante.
 */

import { addDays, addWeeks, format, parseISO, subWeeks } from 'date-fns'
import type { Absence, Contract, OvertimeRequest, Period, Poste, Profile, Shift } from '../types'
import {
  WORK_DAYS_PER_WEEK,
  absentDaysInWeek,
  contractAt,
  projectedBalance,
  shiftHours,
  weekDays,
} from './hours'

/** Un créneau horaire à pourvoir. `track` relie le matin et l'après-midi d'une même « ligne » (A ou B) pour former une journée. */
export interface SlotTemplate {
  day: number // 0 = lundi … 5 = samedi
  period: Period
  start: string // HH:MM
  end: string // HH:MM
  poste: Poste | null
  track: string
}

/**
 * Semaine type des ASV, relevée sur les plannings papier : deux lignes par
 * demi-journée (A ouvre tôt, B ferme tard), jeudi décalé, samedi matin seul.
 */
export const DEFAULT_ASV_TEMPLATE: SlotTemplate[] = (() => {
  const slots: SlotTemplate[] = []
  for (const day of [0, 1, 2, 4]) {
    slots.push({ day, period: 'matin', start: '08:00', end: '13:00', poste: null, track: 'A' })
    slots.push({ day, period: 'matin', start: '08:15', end: '12:30', poste: null, track: 'B' })
    slots.push({ day, period: 'apres-midi', start: '14:30', end: '19:00', poste: null, track: 'A' })
    slots.push({ day, period: 'apres-midi', start: '14:30', end: '19:30', poste: null, track: 'B' })
  }
  slots.push({ day: 3, period: 'matin', start: '08:00', end: '14:00', poste: null, track: 'A' })
  slots.push({ day: 3, period: 'matin', start: '08:15', end: '12:00', poste: null, track: 'B' })
  slots.push({ day: 3, period: 'apres-midi', start: '15:00', end: '19:00', poste: null, track: 'A' })
  slots.push({ day: 3, period: 'apres-midi', start: '14:00', end: '19:30', poste: null, track: 'B' })
  slots.push({ day: 5, period: 'matin', start: '08:30', end: '13:00', poste: 'violet', track: 'A' })
  slots.push({ day: 5, period: 'matin', start: '10:00', end: '14:00', poste: 'vert', track: 'B' })
  return slots
})()

/**
 * Construit un squelette à partir des créneaux d'une semaine existante (on
 * oublie qui les faisait). Dans chaque demi-journée, les créneaux sont
 * ordonnés par heure de début et reçoivent les lignes A, B, C…
 */
export function templateFromWeek(shifts: Shift[], weekStartIso: string): SlotTemplate[] {
  const days = weekDays(weekStartIso).map((d) => format(d, 'yyyy-MM-dd'))
  const slots: SlotTemplate[] = []
  days.forEach((iso, day) => {
    for (const period of ['matin', 'apres-midi'] as Period[]) {
      const ofHalfDay = shifts
        .filter((s) => s.work_date === iso && s.period === period)
        .sort((a, b) => (a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0))
      ofHalfDay.forEach((s, i) => {
        slots.push({
          day,
          period,
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          poste: s.poste,
          track: String.fromCharCode(65 + i),
        })
      })
    }
  })
  return slots
}

export interface AutoplanOptions {
  /** Poids d'une demi-journée isolée (0 = indifférent, 2 = normal, 5 = fort). */
  fullDayWeight: number
  /** Part du cumul annuel qu'on cherche à rattraper cette semaine (0 = aucun, 0.25 = doux, 0.5 = fort). */
  catchUpRate: number
  /** Rattrapage maximal en heures sur une semaine. */
  maxCatchUpHours: number
  /** Pénalité quand une personne a déjà travaillé le samedi précédent. */
  saturdayWeight: number
  seed: number
  iterations: number
}

export const DEFAULT_OPTIONS: AutoplanOptions = {
  fullDayWeight: 2,
  catchUpRate: 0.25,
  maxCatchUpHours: 3,
  saturdayWeight: 3,
  seed: 1,
  iterations: 20000,
}

export interface AutoplanInput {
  weekStart: string
  slots: SlotTemplate[]
  people: Profile[]
  contracts: Contract[]
  absences: Absence[]
  overtimeRequests: OvertimeRequest[]
  /** Créneaux déjà connus de l'année (semaines précédentes), pour le cumul et les samedis. */
  historyShifts: Shift[]
  options?: Partial<AutoplanOptions>
}

export interface PersonPlan {
  employeeId: string
  hours: number
  theoreticalHours: number
  targetHours: number
  cumulBefore: number
  cumulAfter: number
  fullDays: number
  halfDays: number
  absentDays: number
  worksSaturday: boolean
}

export interface AutoplanResult {
  weekStart: string
  slots: SlotTemplate[]
  /** Pour chaque créneau (même index que `slots`), l'id de la personne ou null si personne n'a pu être placée. */
  assignment: (string | null)[]
  people: PersonPlan[]
  unfilled: number
  score: number
  /** Créneaux prêts à être insérés dans `shifts`. */
  toShifts: () => Omit<Shift, 'id'>[]
}

// Générateur pseudo-aléatoire déterministe (mulberry32) pour des résultats reproductibles.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function slotDuration(s: SlotTemplate): number {
  return shiftHours({ start_time: s.start, end_time: s.end })
}

export function generateWeekPlan(input: AutoplanInput): AutoplanResult {
  const opts: AutoplanOptions = { ...DEFAULT_OPTIONS, ...input.options }
  const { weekStart, slots, people, contracts, absences, overtimeRequests, historyShifts } = input
  const random = rng(opts.seed)
  const days = weekDays(weekStart).map((d) => format(d, 'yyyy-MM-dd'))
  const previousWeek = format(subWeeks(parseISO(weekStart), 1), 'yyyy-MM-dd')
  const n = slots.length
  const durations = slots.map(slotDuration)

  // --- Données par personne -------------------------------------------------
  const P = people.length
  const available: boolean[][] = people.map((p) =>
    days.map(
      (iso) =>
        !absences.some(
          (a) =>
            a.employee_id === p.id &&
            a.status === 'approved' &&
            a.start_date <= iso &&
            iso <= a.end_date
        )
    )
  )
  const absentDays = people.map((p) =>
    Math.min(WORK_DAYS_PER_WEEK, absentDaysInWeek(absences, p.id, weekStart))
  )
  const theoretical = people.map((p, i) => {
    const contract = contractAt(
      contracts.filter((c) => c.employee_id === p.id),
      weekStart
    )
    const full = contract?.weekly_hours ?? 0
    return (full * (WORK_DAYS_PER_WEEK - absentDays[i])) / WORK_DAYS_PER_WEEK
  })
  const cumulBefore = people.map(
    (p) =>
      projectedBalance(p.id, previousWeek, historyShifts, contracts, absences, overtimeRequests)
        .cumulativeDelta
  )
  const target = people.map((_, i) => {
    if (theoretical[i] <= 0) return 0
    const catchUp = Math.max(
      -opts.maxCatchUpHours,
      Math.min(opts.maxCatchUpHours, -cumulBefore[i] * opts.catchUpRate)
    )
    return Math.max(0, theoretical[i] + catchUp)
  })
  const lastSaturday = format(addDays(parseISO(previousWeek), 5), 'yyyy-MM-dd')
  const workedLastSaturday = people.map((p) =>
    historyShifts.some((s) => s.employee_id === p.id && s.work_date === lastSaturday)
  )
  const canTake = (pi: number, si: number) => theoretical[pi] > 0 && available[pi][slots[si].day]

  // Jours où le squelette propose les deux demi-journées : seuls ceux-là
  // peuvent donner lieu à une « demi-journée isolée ».
  const dayHasBoth = Array.from({ length: WORK_DAYS_PER_WEEK }, (_, d) => {
    const periods = new Set(slots.filter((s) => s.day === d).map((s) => s.period))
    return periods.size === 2
  })

  // --- Score ------------------------------------------------------------------
  // État dérivé maintenu à la main pour que l'évaluation reste rapide.
  const assignment: (number | null)[] = Array.from({ length: n }, () => null)
  const hours: number[] = Array.from({ length: P }, () => 0)
  // perDay[p][d] = bitmask : 1 = matin, 2 = après-midi
  const perDay: number[][] = people.map(() => Array.from({ length: WORK_DAYS_PER_WEEK }, () => 0))
  const periodBit = (period: Period) => (period === 'matin' ? 1 : 2)

  function scoreOf(): number {
    let s = 0
    for (let i = 0; i < n; i++) if (assignment[i] === null) s += 1000
    for (let p = 0; p < P; p++) {
      const dev = hours[p] - target[p]
      s += dev * dev
      for (let d = 0; d < WORK_DAYS_PER_WEEK; d++) {
        const m = perDay[p][d]
        if (dayHasBoth[d] && (m === 1 || m === 2)) s += opts.fullDayWeight
      }
      if (perDay[p][5] && workedLastSaturday[p]) s += opts.saturdayWeight
    }
    return s
  }

  function place(si: number, pi: number | null) {
    const prev = assignment[si]
    const bit = periodBit(slots[si].period)
    if (prev !== null) {
      hours[prev] -= durations[si]
      perDay[prev][slots[si].day] &= ~bit
    }
    assignment[si] = pi
    if (pi !== null) {
      hours[pi] += durations[si]
      perDay[pi][slots[si].day] |= bit
    }
  }

  const conflicts = (pi: number, si: number) =>
    (perDay[pi][slots[si].day] & periodBit(slots[si].period)) !== 0

  // --- Point de départ glouton : journée par journée, ligne par ligne, on donne
  // la journée à la personne disponible qui a le plus d'heures à faire.
  const tracks = [...new Set(slots.map((s) => s.track))]
  for (let d = 0; d < WORK_DAYS_PER_WEEK; d++) {
    for (const track of tracks) {
      const ofTrack = slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.day === d && s.track === track)
      if (ofTrack.length === 0) continue
      let best: number | null = null
      let bestNeed = -Infinity
      for (let p = 0; p < P; p++) {
        if (!ofTrack.every(({ i }) => canTake(p, i) && !conflicts(p, i))) continue
        const need = target[p] - hours[p]
        if (need > bestNeed) {
          bestNeed = need
          best = p
        }
      }
      if (best !== null) for (const { i } of ofTrack) place(i, best)
    }
  }

  // --- Recuit simulé ----------------------------------------------------------
  let current = scoreOf()
  let bestScore = current
  let bestAssignment = [...assignment]
  const T0 = 20
  for (let it = 0; it < opts.iterations; it++) {
    const temperature = T0 * (1 - it / opts.iterations) + 0.05
    const move = random()
    const si = Math.floor(random() * n)
    const before = assignment[si]
    const undo: Array<[number, number | null]> = []

    if (move < 0.45) {
      // Réaffecter un créneau à une autre personne (ou le vider).
      const pi = random() < 0.05 ? null : Math.floor(random() * P)
      if (pi === before) continue
      if (pi !== null && (!canTake(pi, si) || conflicts(pi, si))) continue
      undo.push([si, before])
      place(si, pi)
    } else if (move < 0.8) {
      // Échanger les personnes de deux créneaux.
      const sj = Math.floor(random() * n)
      const a = assignment[si]
      const b = assignment[sj]
      if (si === sj || a === b) continue
      undo.push([si, a], [sj, b])
      place(si, null)
      place(sj, null)
      const okA = b === null || (canTake(b, si) && !conflicts(b, si))
      const okB = a === null || (canTake(a, sj) && !conflicts(a, sj))
      if (!okA || !okB) {
        place(si, a)
        place(sj, b)
        continue
      }
      place(si, b)
      place(sj, a)
    } else {
      // Donner une journée complète (même jour, même ligne) à une personne.
      const { day, track } = slots[si]
      const pi = Math.floor(random() * P)
      const group = slots.map((_, i) => i).filter((i) => slots[i].day === day && slots[i].track === track)
      if (group.every((i) => assignment[i] === pi)) continue
      for (const i of group) undo.push([i, assignment[i]])
      for (const i of group) place(i, null)
      if (!group.every((i) => canTake(pi, i) && !conflicts(pi, i))) {
        for (const [i, v] of undo) place(i, v)
        continue
      }
      for (const i of group) place(i, pi)
    }

    const next = scoreOf()
    const delta = next - current
    if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
      current = next
      if (current < bestScore) {
        bestScore = current
        bestAssignment = [...assignment]
      }
    } else {
      for (let k = undo.length - 1; k >= 0; k--) place(undo[k][0], undo[k][1])
    }
  }

  // Remet le meilleur état trouvé.
  for (let i = 0; i < n; i++) place(i, null)
  bestAssignment.forEach((pi, i) => place(i, pi))

  // --- Résultat -----------------------------------------------------------------
  const result: PersonPlan[] = people.map((p, i) => {
    let fullDays = 0
    let halfDays = 0
    for (let d = 0; d < WORK_DAYS_PER_WEEK; d++) {
      const m = perDay[i][d]
      if (m === 3) fullDays++
      else if (m !== 0 && dayHasBoth[d]) halfDays++
    }
    const delta = hours[i] - theoretical[i]
    return {
      employeeId: p.id,
      hours: hours[i],
      theoreticalHours: theoretical[i],
      targetHours: target[i],
      cumulBefore: cumulBefore[i],
      cumulAfter: cumulBefore[i] + delta,
      fullDays,
      halfDays,
      absentDays: absentDays[i],
      worksSaturday: perDay[i][5] !== 0,
    }
  })

  const assignmentIds = assignment.map((pi) => (pi === null ? null : people[pi].id))
  return {
    weekStart,
    slots,
    assignment: assignmentIds,
    people: result,
    unfilled: assignmentIds.filter((a) => a === null).length,
    score: bestScore,
    toShifts: () =>
      slots.flatMap((s, i) => {
        const employee_id = assignmentIds[i]
        if (!employee_id) return []
        return [
          {
            employee_id,
            work_date: days[s.day],
            period: s.period,
            start_time: s.start,
            end_time: s.end,
            poste: s.poste,
            note: null,
          },
        ]
      }),
  }
}

/** Lundi de la semaine suivante, pratique pour enchaîner les générations. */
export function nextWeekOf(weekStartIso: string): string {
  return format(addWeeks(parseISO(weekStartIso), 1), 'yyyy-MM-dd')
}
