import { describe, expect, it } from 'vitest'
import { formatHours, shiftHours, weekTotals } from './hours'
import type { Contract, Shift } from '../types'

// Données reprises telles quelles du planning papier fourni :
// semaine du 3/08/2026 au 8/08/2026, CLARA = 45H30 soit 10H30 de plus (contrat 35h).
const claraShifts: Shift[] = [
  { id: '1', employee_id: 'clara', work_date: '2026-08-03', period: 'matin', start_time: '08:00', end_time: '13:00', poste: 'bleu' },
  { id: '2', employee_id: 'clara', work_date: '2026-08-03', period: 'apres-midi', start_time: '14:30', end_time: '19:30', poste: 'bleu' },
  { id: '3', employee_id: 'clara', work_date: '2026-08-04', period: 'matin', start_time: '08:15', end_time: '12:30', poste: 'violet' },
  { id: '4', employee_id: 'clara', work_date: '2026-08-04', period: 'apres-midi', start_time: '14:30', end_time: '19:30', poste: 'violet' },
  { id: '5', employee_id: 'clara', work_date: '2026-08-05', period: 'apres-midi', start_time: '14:30', end_time: '19:30', poste: 'vert' },
  { id: '6', employee_id: 'clara', work_date: '2026-08-06', period: 'matin', start_time: '08:15', end_time: '12:00', poste: 'bleu' },
  { id: '7', employee_id: 'clara', work_date: '2026-08-06', period: 'apres-midi', start_time: '14:00', end_time: '19:00', poste: 'bleu' },
  { id: '8', employee_id: 'clara', work_date: '2026-08-07', period: 'matin', start_time: '08:00', end_time: '13:00', poste: 'violet' },
  { id: '9', employee_id: 'clara', work_date: '2026-08-07', period: 'apres-midi', start_time: '15:00', end_time: '19:30', poste: 'violet' },
  { id: '10', employee_id: 'clara', work_date: '2026-08-08', period: 'matin', start_time: '09:00', end_time: '13:00', poste: 'seul' },
]

const claraContract: Contract[] = [
  { id: 'c1', employee_id: 'clara', label: 'Temps plein', weekly_hours: 35, effective_from: '2026-01-01' },
]

describe('shiftHours', () => {
  it('convertit correctement des horaires avec minutes (4h15)', () => {
    expect(
      shiftHours({ start_time: '08:15', end_time: '12:30' })
    ).toBeCloseTo(4.25, 5)
  })
})

describe('formatHours', () => {
  it('formatte 10.5 en "10h30"', () => {
    expect(formatHours(10.5)).toBe('10h30')
  })
  it('formatte 4.25 en "4h15"', () => {
    expect(formatHours(4.25)).toBe('4h15')
  })
})

describe('weekTotals — comparaison avec le planning papier réel', () => {
  // Le PDF annonce "CLARA = 45H30 soit 10H30 de plus" (contrat 35h) pour la
  // semaine du 3/08. En resommant précisément chaque créneau tel qu'écrit sur
  // le papier, le total réel est 46h30 (le créneau du jeudi "14h-19H" y est
  // noté "(4H)" alors que 14h→19h fait 5h) : le papier contient une petite
  // erreur d'arrondi manuelle, exactement le genre d'erreur que cet outil est
  // censé éliminer. On vérifie donc ici que le calcul automatique est
  // cohérent avec les horaires réellement saisis, au lieu de reproduire
  // l'erreur humaine du total papier.
  it('additionne correctement chaque créneau de la semaine du 3/08 pour CLARA', () => {
    const totals = weekTotals('clara', '2026-08-03', claraShifts, claraContract, [])
    expect(totals.actualHours).toBeCloseTo(46.5, 5)
    expect(formatHours(totals.actualHours)).toBe('46h30')
    expect(totals.theoreticalHours).toBe(35)
    expect(formatHours(totals.delta)).toBe('11h30')
  })
})
