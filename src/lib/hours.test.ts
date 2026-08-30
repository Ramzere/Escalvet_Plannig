import { describe, expect, it } from 'vitest'
import { formatHours, projectedBalance, shiftHours, weekTotals } from './hours'
import type { Absence, Contract, OvertimeRequest, Shift } from '../types'

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
  {
    id: 'c1',
    employee_id: 'clara',
    label: 'Temps plein',
    contract_type: 'CDI',
    weekly_hours: 35,
    effective_from: '2026-01-01',
    effective_to: null,
  },
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

describe('weekTotals — heures sup', () => {
  const overtime: OvertimeRequest[] = [
    {
      id: 'o1',
      employee_id: 'clara',
      work_date: '2026-08-04',
      hours: 1,
      minutes: 30,
      status: 'approved',
      created_at: '2026-08-04T00:00:00Z',
    },
    {
      id: 'o2',
      employee_id: 'clara',
      work_date: '2026-08-05',
      hours: 2,
      minutes: 0,
      status: 'pending',
      created_at: '2026-08-05T00:00:00Z',
    },
  ]

  it('ajoute au solde uniquement les heures sup approuvées de la semaine', () => {
    const totals = weekTotals('clara', '2026-08-03', claraShifts, claraContract, [], overtime)
    expect(totals.approvedOvertime).toBeCloseTo(1.5, 5)
    expect(formatHours(totals.delta)).toBe('13h')
  })

  it("ignore les heures sup en attente ou d'un autre employé", () => {
    const totals = weekTotals('clara', '2026-08-03', claraShifts, claraContract, [], [
      { ...overtime[1], employee_id: 'other' },
    ])
    expect(totals.approvedOvertime).toBe(0)
  })
})

describe('weekTotals — absences au prorata', () => {
  it('réduit les heures théoriques au prorata des jours d\'absence dans la semaine', () => {
    // Semaine du 3/08 (lundi) au 8/08 (samedi) : 4 jours d'absence sur 6 =>
    // il ne reste que 2/6 des heures théoriques (35h -> 11h40).
    const absences: Absence[] = [
      { id: 'a1', employee_id: 'clara', start_date: '2026-08-03', end_date: '2026-08-06', reason: 'Congés', status: 'approved' },
    ]
    const totals = weekTotals('clara', '2026-08-03', claraShifts, claraContract, absences)
    expect(totals.absentDays).toBe(4)
    expect(totals.isAbsentWeek).toBe(false)
    expect(totals.theoreticalHours).toBeCloseTo((35 * 2) / 6, 5)
  })

  it('marque la semaine comme entièrement absente quand les 6 jours sont couverts', () => {
    const absences: Absence[] = [
      { id: 'a1', employee_id: 'clara', start_date: '2026-08-03', end_date: '2026-08-08', reason: 'Congés', status: 'approved' },
    ]
    const totals = weekTotals('clara', '2026-08-03', claraShifts, claraContract, absences)
    expect(totals.isAbsentWeek).toBe(true)
    expect(totals.theoreticalHours).toBe(0)
  })

  it('ignore une demande d\'absence en attente ou refusée dans le calcul des heures théoriques', () => {
    const absences: Absence[] = [
      { id: 'a1', employee_id: 'clara', start_date: '2026-08-03', end_date: '2026-08-08', reason: 'Congés', status: 'pending' },
      { id: 'a2', employee_id: 'clara', start_date: '2026-08-03', end_date: '2026-08-08', reason: 'Congés', status: 'rejected' },
    ]
    const totals = weekTotals('clara', '2026-08-03', claraShifts, claraContract, absences)
    expect(totals.absentDays).toBe(0)
    expect(totals.theoreticalHours).toBe(35)
  })
})

describe('weekTotals / projectedBalance — un contrat ne concerne que son employé', () => {
  it("le contrat d'un autre employé ne change pas les heures théoriques ni le cumul de Clara", () => {
    // Reproduit le bug remonté : ajouter un contrat pour "amandine" (démarrant
    // après celui de Clara) ne doit avoir aucun effet sur le calcul de Clara.
    const contractsWithOther: Contract[] = [
      ...claraContract,
      {
        id: 'amandine-c1',
        employee_id: 'amandine',
        label: 'Temps plein',
        contract_type: 'CDI',
        weekly_hours: 30,
        effective_from: '2026-07-01',
        effective_to: null,
      },
    ]
    const before = weekTotals('clara', '2026-08-03', claraShifts, claraContract, [])
    const after = weekTotals('clara', '2026-08-03', claraShifts, contractsWithOther, [])
    expect(after.theoreticalHours).toBe(before.theoreticalHours)

    const projectionBefore = projectedBalance('clara', '2026-08-03', claraShifts, claraContract, [])
    const projectionAfter = projectedBalance('clara', '2026-08-03', claraShifts, contractsWithOther, [])
    expect(projectionAfter.cumulativeDelta).toBeCloseTo(projectionBefore.cumulativeDelta, 5)
  })
})

describe('projectedBalance — redémarre au 1er janvier et à chaque changement de contrat', () => {
  it('ne cumule rien avant le début du contrat, puis redémarre à zéro sur le nouveau contrat', () => {
    const contracts: Contract[] = [
      {
        id: 'cdd',
        employee_id: 'clara',
        label: 'CDD',
        contract_type: 'CDD',
        weekly_hours: 35,
        effective_from: '2026-03-02', // lundi
        effective_to: '2026-03-15',
      },
      {
        id: 'cdi',
        employee_id: 'clara',
        label: 'CDI',
        contract_type: 'CDI',
        weekly_hours: 35,
        effective_from: '2026-03-23', // lundi
        effective_to: null,
      },
    ]
    // Une seule semaine travaillée sous CDI (23/03 -> 28/03), pour 38h au lieu
    // des 35h théoriques : le cumul ne doit tenir compte que de cette semaine
    // (les semaines précédentes, sous CDD, sont réinitialisées au changement
    // de contrat), soit un delta de +3h.
    const shifts: Shift[] = [
      { id: 's1', employee_id: 'clara', work_date: '2026-03-23', period: 'matin', start_time: '08:00', end_time: '13:00', poste: 'bleu' },
      { id: 's2', employee_id: 'clara', work_date: '2026-03-23', period: 'apres-midi', start_time: '14:00', end_time: '19:00', poste: 'bleu' },
      { id: 's3', employee_id: 'clara', work_date: '2026-03-24', period: 'matin', start_time: '08:00', end_time: '13:00', poste: 'bleu' },
      { id: 's4', employee_id: 'clara', work_date: '2026-03-24', period: 'apres-midi', start_time: '14:00', end_time: '19:00', poste: 'bleu' },
      { id: 's5', employee_id: 'clara', work_date: '2026-03-25', period: 'matin', start_time: '08:00', end_time: '13:00', poste: 'bleu' },
      { id: 's6', employee_id: 'clara', work_date: '2026-03-25', period: 'apres-midi', start_time: '14:00', end_time: '19:00', poste: 'bleu' },
      { id: 's7', employee_id: 'clara', work_date: '2026-03-26', period: 'matin', start_time: '08:00', end_time: '13:00', poste: 'bleu' },
      { id: 's8', employee_id: 'clara', work_date: '2026-03-26', period: 'apres-midi', start_time: '14:00', end_time: '17:00', poste: 'bleu' },
    ]
    const projection = projectedBalance('clara', '2026-03-23', shifts, contracts, [])
    expect(projection.cumulativeDelta).toBeCloseTo(3, 5)
  })
})
