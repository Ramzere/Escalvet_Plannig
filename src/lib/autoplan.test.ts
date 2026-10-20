import { describe, expect, it } from 'vitest'
import { DEFAULT_ASV_TEMPLATE, generateWeekPlan, templateFromWeek } from './autoplan'
import type { Absence, Contract, Profile, Shift } from '../types'

const WEEK = '2026-11-02' // lundi

function person(id: string, name: string): Profile {
  return { id, full_name: name, group_name: 'asv', is_owner: false, active: true }
}
function contract(employee_id: string, weekly_hours = 35): Contract {
  return {
    id: `c-${employee_id}`,
    employee_id,
    label: 'CDI',
    contract_type: 'CDI',
    weekly_hours,
    effective_from: '2026-01-01',
    effective_to: null,
  }
}

const team = [person('a', 'Clara'), person('b', 'Emilie'), person('c', 'Romane')]
const contracts = team.map((t) => contract(t.id))

function run(extra: Partial<Parameters<typeof generateWeekPlan>[0]> = {}) {
  return generateWeekPlan({
    weekStart: WEEK,
    slots: DEFAULT_ASV_TEMPLATE,
    people: team,
    contracts,
    absences: [],
    overtimeRequests: [],
    historyShifts: [],
    options: { seed: 7, iterations: 8000 },
    ...extra,
  })
}

describe('generateWeekPlan', () => {
  it('pourvoit tous les créneaux sans mettre une personne deux fois sur la même demi-journée', () => {
    const r = run()
    expect(r.unfilled).toBe(0)
    const seen = new Set<string>()
    r.slots.forEach((s, i) => {
      const key = `${r.assignment[i]}|${s.day}|${s.period}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    })
  })

  it("n'affecte jamais une personne absente ce jour-là", () => {
    const absences: Absence[] = [
      { id: 'x', employee_id: 'a', start_date: '2026-11-02', end_date: '2026-11-04', reason: 'CP', status: 'approved', counts_as_leave: true },
    ]
    const r = run({ absences })
    r.slots.forEach((s, i) => {
      if (r.assignment[i] === 'a') expect(s.day).toBeGreaterThan(2)
    })
    const clara = r.people.find((p) => p.employeeId === 'a')!
    expect(clara.absentDays).toBe(3)
    expect(clara.theoreticalHours).toBeCloseTo(17.5)
  })

  it('privilégie les journées entières aux demi-journées isolées', () => {
    const r = run({ options: { seed: 3, iterations: 15000, fullDayWeight: 5 } })
    const halfDays = r.people.reduce((s, p) => s + p.halfDays, 0)
    const fullDays = r.people.reduce((s, p) => s + p.fullDays, 0)
    expect(fullDays).toBeGreaterThan(halfDays)
    // 10 journées (lundi→vendredi × 2 lignes) : on en attend l'immense majorité complètes.
    expect(halfDays).toBeLessThanOrEqual(2)
  })

  it('reste proche du contrat de chacune', () => {
    // Sans rattrapage : la semaine type fait ~103h pour 3 × 35h, chacune doit en être proche.
    const r = run({ options: { seed: 7, iterations: 8000, catchUpRate: 0 } })
    for (const p of r.people) {
      expect(Math.abs(p.hours - p.targetHours)).toBeLessThan(4)
    }
  })

  it('rattrape en douceur un cumul négatif', () => {
    // Clara a un gros déficit (semaine précédente : rien planifié mais contrat 35h).
    const history: Shift[] = []
    const r = run({ historyShifts: history, options: { seed: 1, iterations: 8000, catchUpRate: 0.25, maxCatchUpHours: 3 } })
    for (const p of r.people) {
      expect(p.cumulBefore).toBeLessThan(0)
      expect(p.targetHours).toBeGreaterThan(p.theoreticalHours)
      expect(p.targetHours - p.theoreticalHours).toBeLessThanOrEqual(3)
    }
  })

  it('reproduit la même proposition pour la même graine', () => {
    expect(run().assignment).toEqual(run().assignment)
    expect(run({ options: { seed: 99, iterations: 8000 } }).assignment).not.toEqual(run().assignment)
  })
})

describe('jours fériés', () => {
  it('ne planifie personne un jour férié et baisse la cible en conséquence', () => {
    // Semaine du 9 novembre 2026 : mercredi 11 férié.
    const r = run({ weekStart: '2026-11-09', options: { seed: 7, iterations: 8000, catchUpRate: 0 } })
    expect(r.slots.some((s) => s.day === 2)).toBe(false)
    expect(r.toShifts().some((s) => s.work_date === '2026-11-11')).toBe(false)
    for (const p of r.people) expect(p.theoreticalHours).toBeCloseTo(35 * 5 / 6)
  })
})

describe('postes', () => {
  it('met le chenil/chir sur la ligne A, l’accueil sur la B, et « seul » quand une personne est seule', () => {
    const r = run()
    r.slots.forEach((s, i) => {
      if (s.day === 5) return // samedi : postes fixés par la semaine type (accueil + volante)
      expect(r.postes[i]).toBe(s.track === 'A' ? 'bleu' : 'violet')
    })
    const shifts = r.toShifts()
    expect(shifts.every((s) => s.poste !== null)).toBe(true)

    // Une seule personne disponible : elle est « seule » sur chaque demi-journée.
    const solo = run({ people: [team[0]], contracts: [contracts[0]] })
    solo.slots.forEach((_, i) => {
      if (solo.assignment[i] !== null) expect(solo.postes[i]).toBe('seul')
    })
  })

  it('ne met aucun poste pour les vétérinaires', () => {
    const r = run({ withPostes: false })
    expect(r.postes.every((p) => p === null)).toBe(true)
    expect(r.toShifts().every((s) => s.poste === null)).toBe(true)
  })
})

describe('templateFromWeek', () => {
  it('reprend les horaires d’une semaine en oubliant les personnes', () => {
    const shifts: Shift[] = [
      { id: '1', employee_id: 'a', work_date: '2026-10-26', period: 'matin', start_time: '08:15:00', end_time: '12:30:00', poste: null },
      { id: '2', employee_id: 'b', work_date: '2026-10-26', period: 'matin', start_time: '08:00:00', end_time: '13:00:00', poste: null },
      { id: '3', employee_id: 'b', work_date: '2026-10-31', period: 'matin', start_time: '10:00:00', end_time: '14:00:00', poste: 'vert' },
    ]
    const t = templateFromWeek(shifts, '2026-10-26')
    expect(t).toEqual([
      { day: 0, period: 'matin', start: '08:00', end: '13:00', poste: null, track: 'A' },
      { day: 0, period: 'matin', start: '08:15', end: '12:30', poste: null, track: 'B' },
      { day: 5, period: 'matin', start: '10:00', end: '14:00', poste: 'vert', track: 'A' },
    ])
  })
})
