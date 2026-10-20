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
  contractAt,
  offDaysInWeek,
  projectedBalance,
  shiftHours,
  weekDays,
} from './hours'
import { isPublicHoliday } from './holidays'

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
 * demi-journée (A ouvre tôt = chenil/chirurgie en bleu, B ferme tard =
 * accueil en violet), jeudi décalé, samedi matin seul (accueil + volante).
 */
export const DEFAULT_ASV_TEMPLATE: SlotTemplate[] = (() => {
  const slots: SlotTemplate[] = []
  for (const day of [0, 1, 2, 4]) {
    slots.push({ day, period: 'matin', start: '08:00', end: '13:00', poste: 'bleu', track: 'A' })
    slots.push({ day, period: 'matin', start: '08:15', end: '12:30', poste: 'violet', track: 'B' })
    slots.push({ day, period: 'apres-midi', start: '14:30', end: '19:00', poste: 'bleu', track: 'A' })
    slots.push({ day, period: 'apres-midi', start: '14:30', end: '19:30', poste: 'violet', track: 'B' })
  }
  slots.push({ day: 3, period: 'matin', start: '08:00', end: '14:00', poste: 'bleu', track: 'A' })
  slots.push({ day: 3, period: 'matin', start: '08:15', end: '12:00', poste: 'violet', track: 'B' })
  slots.push({ day: 3, period: 'apres-midi', start: '15:00', end: '19:00', poste: 'bleu', track: 'A' })
  slots.push({ day: 3, period: 'apres-midi', start: '14:00', end: '19:30', poste: 'violet', track: 'B' })
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

/**
 * Poste par défaut d'un créneau quand le squelette n'en précise pas : la
 * ligne A (ouverture tôt) est au chenil/chirurgie, les autres à l'accueil.
 */
export function defaultPosteFor(slot: SlotTemplate): Poste {
  if (slot.poste) return slot.poste
  return slot.track === 'A' ? 'bleu' : 'violet'
}

/**
 * Postes finaux d'une affectation : règle par défaut, et « seul » (tous les
 * postes) quand une seule personne est planifiée sur la demi-journée.
 * Retourne null partout pour les groupes sans notion de poste (vétérinaires).
 */
export function postesFor(
  slots: SlotTemplate[],
  assignment: (string | null)[],
  withPostes: boolean
): (Poste | null)[] {
  if (!withPostes) return slots.map(() => null)
  return slots.map((s, i) => {
    if (assignment[i] === null) return defaultPosteFor(s)
    const alone =
      slots.filter((o, j) => o.day === s.day && o.period === s.period && assignment[j] !== null)
        .length === 1
    return alone ? 'seul' : defaultPosteFor(s)
  })
}

export interface AutoplanInput {
  weekStart: string
  slots: SlotTemplate[]
  /** false pour les vétérinaires (pas de poste). Par défaut true. */
  withPostes?: boolean
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
  /** Poste final de chaque créneau (règle par défaut + « seul »), même index que `slots`. */
  postes: (Poste | null)[]
  people: PersonPlan[]
  unfilled: number
  /** Index des créneaux où une personne est placée deux fois sur la même demi-journée. */
  conflicts: number[]
  /** Index des créneaux où la personne placée est absente ce jour-là. */
  unavailable: number[]
  /** Index des créneaux où la personne placée a une demande d'absence en attente ce jour-là. */
  pendingAbsence: number[]
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

/** Tout ce qui se déduit des entrées avant de chercher une affectation. */
function buildContext(input: AutoplanInput) {
  const opts: AutoplanOptions = { ...DEFAULT_OPTIONS, ...input.options }
  const { weekStart, people, contracts, absences, overtimeRequests, historyShifts } = input
  const days = weekDays(weekStart).map((d) => format(d, 'yyyy-MM-dd'))
  // Cabinet fermé les jours fériés : on retire ces créneaux du squelette.
  const slots = input.slots.filter((s) => !isPublicHoliday(days[s.day]))
  const previousWeek = format(subWeeks(parseISO(weekStart), 1), 'yyyy-MM-dd')
  const durations = slots.map(slotDuration)

  // --- Données par personne -------------------------------------------------
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
  const hasPendingAbsence: boolean[][] = people.map((p) =>
    days.map((iso) =>
      absences.some(
        (a) =>
          a.employee_id === p.id &&
          a.status === 'pending' &&
          a.start_date <= iso &&
          iso <= a.end_date
      )
    )
  )
  const off = people.map((p) => offDaysInWeek(absences, p.id, weekStart))
  const absentDays = off.map((o) => o.absentDays)
  const theoretical = people.map((p, i) => {
    const contract = contractAt(
      contracts.filter((c) => c.employee_id === p.id),
      weekStart
    )
    const full = contract?.weekly_hours ?? 0
    return (full * (WORK_DAYS_PER_WEEK - off[i].offDays)) / WORK_DAYS_PER_WEEK
  })
  // Le cumul repart de zéro au 1er janvier : si la semaine précédente est
  // sur l'année d'avant, on ne traîne rien.
  const sameYear = previousWeek.slice(0, 4) === weekStart.slice(0, 4)
  const cumulBefore = people.map((p) =>
    sameYear
      ? projectedBalance(p.id, previousWeek, historyShifts, contracts, absences, overtimeRequests)
          .cumulativeDelta
      : 0
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
  // Jours où le squelette propose les deux demi-journées : seuls ceux-là
  // peuvent donner lieu à une « demi-journée isolée ».
  const dayHasBoth = Array.from({ length: WORK_DAYS_PER_WEEK }, (_, d) => {
    const periods = new Set(slots.filter((s) => s.day === d).map((s) => s.period))
    return periods.size === 2
  })

  return {
    opts,
    weekStart,
    days,
    slots,
    durations,
    people,
    available,
    hasPendingAbsence,
    absentDays,
    theoretical,
    target,
    cumulBefore,
    workedLastSaturday,
    dayHasBoth,
    withPostes: input.withPostes ?? true,
  }
}

type Context = ReturnType<typeof buildContext>

const periodIdx = (period: Period) => (period === 'matin' ? 0 : 1)

/** Construit le résultat (soldes, postes, conflits) pour une affectation donnée. */
function buildResult(ctx: Context, assignmentIds: (string | null)[], score: number): AutoplanResult {
  const { slots, days, people, durations, theoretical, target, cumulBefore, absentDays, dayHasBoth } = ctx
  const index = new Map(people.map((p, i) => [p.id, i]))
  const hours = people.map(() => 0)
  const count = people.map(() => Array.from({ length: WORK_DAYS_PER_WEEK }, () => [0, 0]))
  const conflicts: number[] = []
  const unavailable: number[] = []
  const pendingAbsence: number[] = []

  slots.forEach((s, i) => {
    const id = assignmentIds[i]
    if (id === null) return
    const pi = index.get(id)
    if (pi === undefined) return
    hours[pi] += durations[i]
    count[pi][s.day][periodIdx(s.period)]++
    if (!ctx.available[pi][s.day]) unavailable.push(i)
    else if (ctx.hasPendingAbsence[pi][s.day]) pendingAbsence.push(i)
  })
  slots.forEach((s, i) => {
    const id = assignmentIds[i]
    const pi = id === null ? undefined : index.get(id)
    if (pi !== undefined && count[pi][s.day][periodIdx(s.period)] > 1) conflicts.push(i)
  })

  const result: PersonPlan[] = people.map((p, i) => {
    let fullDays = 0
    let halfDays = 0
    for (let d = 0; d < WORK_DAYS_PER_WEEK; d++) {
      const m = count[i][d][0] > 0
      const a = count[i][d][1] > 0
      if (m && a) fullDays++
      else if ((m || a) && dayHasBoth[d]) halfDays++
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
      worksSaturday: count[i][5][0] > 0 || count[i][5][1] > 0,
    }
  })

  const postes = postesFor(slots, assignmentIds, ctx.withPostes)
  return {
    weekStart: ctx.weekStart,
    slots,
    assignment: assignmentIds,
    postes,
    people: result,
    unfilled: assignmentIds.filter((a) => a === null).length,
    conflicts,
    unavailable,
    pendingAbsence,
    score,
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
            poste: postes[i],
            note: null,
          },
        ]
      }),
  }
}

/**
 * Réévalue une affectation modifiée à la main (soldes, postes, conflits).
 * `slots` doit être celui d'un résultat précédent (déjà sans les fériés).
 */
export function evaluatePlan(
  input: AutoplanInput,
  slots: SlotTemplate[],
  assignmentIds: (string | null)[]
): AutoplanResult {
  const ctx = buildContext({ ...input, slots })
  return buildResult(ctx, assignmentIds, Number.NaN)
}

export function generateWeekPlan(input: AutoplanInput): AutoplanResult {
  const ctx = buildContext(input)
  const { opts, slots, durations, people, available, theoretical, target, workedLastSaturday, dayHasBoth } = ctx
  const random = rng(opts.seed)
  const n = slots.length
  const P = people.length
  const canTake = (pi: number, si: number) => theoretical[pi] > 0 && available[pi][slots[si].day]

  // --- Score ------------------------------------------------------------------
  // État dérivé maintenu à la main pour que l'évaluation reste rapide.
  const assignment: (number | null)[] = Array.from({ length: n }, () => null)
  const hours: number[] = Array.from({ length: P }, () => 0)
  // count[p][d][0] = nb de créneaux le matin, [1] = l'après-midi. Un compteur
  // (et non un bit) : lors de l'annulation d'un échange entre deux créneaux
  // de la même demi-journée, on passe par un état transitoire où la personne
  // tient les deux, et libérer l'un ne doit pas effacer l'autre.
  const count: number[][][] = people.map(() =>
    Array.from({ length: WORK_DAYS_PER_WEEK }, () => [0, 0])
  )
  const worksMorning = (p: number, d: number) => count[p][d][0] > 0
  const worksAfternoon = (p: number, d: number) => count[p][d][1] > 0

  function scoreOf(): number {
    let s = 0
    for (let i = 0; i < n; i++) if (assignment[i] === null) s += 1000
    for (let p = 0; p < P; p++) {
      const dev = hours[p] - target[p]
      s += dev * dev
      for (let d = 0; d < WORK_DAYS_PER_WEEK; d++) {
        if (dayHasBoth[d] && worksMorning(p, d) !== worksAfternoon(p, d)) s += opts.fullDayWeight
      }
      if ((worksMorning(p, 5) || worksAfternoon(p, 5)) && workedLastSaturday[p]) {
        s += opts.saturdayWeight
      }
    }
    return s
  }

  function place(si: number, pi: number | null) {
    const prev = assignment[si]
    const { day } = slots[si]
    const k = periodIdx(slots[si].period)
    if (prev !== null) {
      hours[prev] -= durations[si]
      count[prev][day][k]--
    }
    assignment[si] = pi
    if (pi !== null) {
      hours[pi] += durations[si]
      count[pi][day][k]++
    }
  }

  const conflicts = (pi: number, si: number) =>
    count[pi][slots[si].day][periodIdx(slots[si].period)] > 0

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

  const assignmentIds = bestAssignment.map((pi) => (pi === null ? null : people[pi].id))
  return buildResult(ctx, assignmentIds, bestScore)
}

/** Lundi de la semaine suivante, pratique pour enchaîner les générations. */
export function nextWeekOf(weekStartIso: string): string {
  return format(addWeeks(parseISO(weekStartIso), 1), 'yyyy-MM-dd')
}
