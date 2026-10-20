import { describe, expect, it } from 'vitest'
import { formatDays, leaveDaysOf, leaveSummary, overlappingAbsences, reasonCountsAsLeave } from './leave'
import type { Absence, LeaveBalance } from '../types'

function abs(partial: Partial<Absence> & Pick<Absence, 'start_date' | 'end_date'>): Absence {
  return {
    id: Math.random().toString(36).slice(2),
    employee_id: 'a',
    reason: 'Congés',
    status: 'approved',
    counts_as_leave: true,
    ...partial,
  }
}

describe('leaveDaysOf', () => {
  it('compte les jours lundi → samedi, pas les dimanches', () => {
    // Vendredi 9 → samedi 10 octobre 2026 : 2 jours
    expect(leaveDaysOf({ start_date: '2026-10-09', end_date: '2026-10-10' }, 2026)).toBe(2)
    // Lundi 5 → samedi 10 : 6 jours
    expect(leaveDaysOf({ start_date: '2026-10-05', end_date: '2026-10-10' }, 2026)).toBe(6)
    // Lundi 5 → lundi 12 : 7 jours (le dimanche 11 ne compte pas)
    expect(leaveDaysOf({ start_date: '2026-10-05', end_date: '2026-10-12' }, 2026)).toBe(7)
  })

  it('ne décompte pas un férié pris dans des congés', () => {
    // Lundi 9 → samedi 14 novembre 2026, mercredi 11 férié : 5 jours.
    expect(leaveDaysOf({ start_date: '2026-11-09', end_date: '2026-11-14' }, 2026)).toBe(5)
  })

  it('ne compte que la part de l’année demandée', () => {
    const a = { start_date: '2026-12-28', end_date: '2027-01-02' }
    expect(leaveDaysOf(a, 2026)).toBe(4) // lun 28, mar 29, mer 30, jeu 31
    expect(leaveDaysOf(a, 2027)).toBe(1) // sam 2 (le vendredi 1er est férié)
  })
})

describe('leaveSummary', () => {
  const today = new Date(2026, 9, 20) // 20 octobre 2026
  const absences: Absence[] = [
    abs({ start_date: '2026-02-16', end_date: '2026-02-21' }), // 6 j pris
    abs({ start_date: '2026-10-09', end_date: '2026-10-10' }), // 2 j pris
    abs({ start_date: '2026-12-21', end_date: '2026-12-26' }), // 5 j à venir (25 déc férié)
    abs({ start_date: '2026-11-02', end_date: '2026-11-03', status: 'pending' }), // 2 j en attente
    abs({ start_date: '2026-11-09', end_date: '2026-11-09', status: 'rejected' }), // ignoré
    abs({ start_date: '2026-10-12', end_date: '2026-10-17', reason: 'École', counts_as_leave: false }), // hors congés
    abs({ start_date: '2026-03-02', end_date: '2026-03-03', employee_id: 'b' }), // quelqu'un d'autre
  ]

  it('fait le bilan avec les droits par défaut', () => {
    const s = leaveSummary('a', 2026, absences, [], today)
    expect(s).toMatchObject({ entitlement: 30, carryOver: 0, taken: 8, planned: 5, pending: 2, remaining: 17, isDefault: true })
  })

  it('utilise les droits saisis et le report', () => {
    const balances: LeaveBalance[] = [{ id: 'x', employee_id: 'a', year: 2026, entitlement: 25, carry_over: 3.5 }]
    const s = leaveSummary('a', 2026, absences, balances, today)
    expect(s.remaining).toBe(25 + 3.5 - 8 - 5)
    expect(s.isDefault).toBe(false)
  })
})

describe('chevauchements', () => {
  it('ne compte pas deux fois les mêmes jours', () => {
    const today = new Date(2026, 9, 20)
    const doubled: Absence[] = [
      abs({ start_date: '2026-02-16', end_date: '2026-02-21' }), // 6 j
      abs({ start_date: '2026-02-18', end_date: '2026-02-25' }), // chevauche : 18→21 déjà comptés, +4 (23,24,25 + 18→21 non) → 22(dim) exclu
    ]
    const s = leaveSummary('a', 2026, doubled, [], today)
    expect(s.taken).toBe(9) // 16→21 (6) + 23,24,25 (3)
  })

  it('détecte une absence qui chevauche', () => {
    const existing: Absence[] = [
      abs({ id: 'e1', start_date: '2026-03-02', end_date: '2026-03-07' }),
      abs({ id: 'e2', start_date: '2026-03-16', end_date: '2026-03-16', status: 'rejected' }),
    ]
    expect(overlappingAbsences(existing, 'a', '2026-03-07', '2026-03-10').map((a) => a.id)).toEqual(['e1'])
    expect(overlappingAbsences(existing, 'a', '2026-03-09', '2026-03-10')).toEqual([])
    expect(overlappingAbsences(existing, 'a', '2026-03-16', '2026-03-16')).toEqual([]) // refusée : ignorée
    expect(overlappingAbsences(existing, 'a', '2026-03-02', '2026-03-02', 'e1')).toEqual([]) // édition de e1
    expect(overlappingAbsences(existing, 'b', '2026-03-02', '2026-03-07')).toEqual([])
  })
})

describe('reasonCountsAsLeave', () => {
  it('reconnaît les motifs hors congés', () => {
    for (const r of ['École', 'ecole', 'Arrêt maladie', 'arret', 'Formation', 'Férié', 'Sans solde', 'Fin de contrat', 'FIN DE CONTRAT']) {
      expect(reasonCountsAsLeave(r)).toBe(false)
    }
    for (const r of ['Congés', 'CP', 'Vacances', 'Repos', 'RTT']) expect(reasonCountsAsLeave(r)).toBe(true)
  })
})

describe('formatDays', () => {
  it('arrondit au demi-jour en français', () => {
    expect(formatDays(12)).toBe('12 j')
    expect(formatDays(2.5)).toBe('2,5 j')
    expect(formatDays(-1.5)).toBe('-1,5 j')
  })
})
