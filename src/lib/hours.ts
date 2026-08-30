import {
  addDays,
  addWeeks,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import type { Absence, Contract, OvertimeRequest, Shift } from '../types'

/** Nombre de jours travaillés dans la semaine type du cabinet (lundi -> samedi). */
export const WORK_DAYS_PER_WEEK = 6

/** Lundi de la semaine contenant `date`, au format yyyy-mm-dd. */
export function weekStartOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function weekDays(weekStartIso: string): Date[] {
  const start = parseISO(weekStartIso)
  return Array.from({ length: WORK_DAYS_PER_WEEK }, (_, i) => addDays(start, i)) // lundi -> samedi
}

/** Durée d'un créneau en heures décimales (ex: 4h15 -> 4.25). */
export function shiftHours(shift: Pick<Shift, 'start_time' | 'end_time'>): number {
  const [sh, sm] = shift.start_time.split(':').map(Number)
  const [eh, em] = shift.end_time.split(':').map(Number)
  const minutes = differenceInMinutes(
    new Date(2000, 0, 1, eh, em),
    new Date(2000, 0, 1, sh, sm)
  )
  return Math.max(0, minutes) / 60
}

/** Formatte un nombre d'heures décimal en "XhYY" (ex: 4.25 -> "4h15"). */
export function formatHours(hours: number): string {
  const sign = hours < 0 ? '-' : ''
  const abs = Math.abs(hours)
  const h = Math.floor(abs + 1e-9)
  const m = Math.round((abs - h) * 60)
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h${String(m).padStart(2, '0')}`
}

/** Le contrat en vigueur à une date donnée (effective_from <= date <= effective_to, s'il y en a un). */
export function contractAt(contracts: Contract[], isoDate: string): Contract | null {
  const target = parseISO(isoDate)
  const applicable = contracts
    .filter(
      (c) =>
        !isAfter(parseISO(c.effective_from), target) &&
        (!c.effective_to || !isAfter(target, parseISO(c.effective_to)))
    )
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
  return applicable[0] ?? null
}

/** Nombre de jours de la semaine (parmi les jours travaillés lundi -> samedi) couverts par une absence. */
export function absentDaysInWeek(
  absences: Absence[],
  employeeId: string,
  weekStartIso: string
): number {
  const days = weekDays(weekStartIso).map((d) => format(d, 'yyyy-MM-dd'))
  const employeeAbsences = absences.filter((a) => a.employee_id === employeeId)
  return days.filter((day) => employeeAbsences.some((a) => a.start_date <= day && day <= a.end_date))
    .length
}

/** Durée d'une déclaration d'heures sup en heures décimales (ex: 1h30 -> 1.5). */
export function overtimeHoursOf(o: Pick<OvertimeRequest, 'hours' | 'minutes'>): number {
  return o.hours + o.minutes / 60
}

/** Total des heures sup approuvées d'un employé pour une semaine donnée. */
export function approvedOvertimeForWeek(
  overtimeRequests: OvertimeRequest[],
  employeeId: string,
  weekStartIso: string
): number {
  const days = weekDays(weekStartIso).map((d) => format(d, 'yyyy-MM-dd'))
  return overtimeRequests
    .filter(
      (o) => o.employee_id === employeeId && o.status === 'approved' && days.includes(o.work_date)
    )
    .reduce((sum, o) => sum + overtimeHoursOf(o), 0)
}

export interface WeekTotals {
  weekStart: string
  actualHours: number
  theoreticalHours: number
  approvedOvertime: number
  delta: number
  isAbsentWeek: boolean
  absentDays: number
}

/** Total réel travaillé sur la semaine par un employé. */
export function actualHoursForWeek(
  shifts: Shift[],
  employeeId: string,
  weekStartIso: string
): number {
  const days = weekDays(weekStartIso).map((d) => format(d, 'yyyy-MM-dd'))
  return shifts
    .filter((s) => s.employee_id === employeeId && days.includes(s.work_date))
    .reduce((sum, s) => sum + shiftHours(s), 0)
}

/**
 * Calcule le solde d'heures d'un employé pour une semaine donnée, en tenant
 * compte du contrat en vigueur et des jours d'absence (les heures théoriques
 * sont réduites au prorata des jours d'absence dans la semaine).
 */
export function weekTotals(
  employeeId: string,
  weekStartIso: string,
  shifts: Shift[],
  contracts: Contract[],
  absences: Absence[],
  overtimeRequests: OvertimeRequest[] = []
): WeekTotals {
  const absentDays = Math.min(WORK_DAYS_PER_WEEK, absentDaysInWeek(absences, employeeId, weekStartIso))
  const isAbsentWeek = absentDays >= WORK_DAYS_PER_WEEK
  const actualHours = actualHoursForWeek(shifts, employeeId, weekStartIso)
  const contract = contractAt(contracts, weekStartIso)
  const fullWeeklyHours = contract?.weekly_hours ?? 0
  const theoreticalHours =
    (fullWeeklyHours * (WORK_DAYS_PER_WEEK - absentDays)) / WORK_DAYS_PER_WEEK
  const approvedOvertime = approvedOvertimeForWeek(overtimeRequests, employeeId, weekStartIso)
  return {
    weekStart: weekStartIso,
    actualHours,
    theoreticalHours,
    approvedOvertime,
    delta: actualHours - theoreticalHours + approvedOvertime,
    isAbsentWeek,
    absentDays,
  }
}

export interface ProjectedBalance {
  employeeId: string
  asOfWeekStart: string
  weeks: WeekTotals[]
  cumulativeDelta: number
}

/**
 * Solde prévisionnel cumulé depuis le 1er janvier de l'année de la semaine
 * ciblée, jusqu'à (et y compris) cette semaine — fonctionne aussi pour une
 * semaine future : c'est un calcul prévisionnel basé sur ce qui est déjà
 * planifié. Le cumul redémarre à zéro à chaque changement de contrat (ex :
 * début d'un CDD en cours d'année, ou passage CDD -> CDI), en plus du
 * redémarrage annuel au 1er janvier.
 */
export function projectedBalance(
  employeeId: string,
  targetWeekStartIso: string,
  shifts: Shift[],
  contracts: Contract[],
  absences: Absence[],
  overtimeRequests: OvertimeRequest[] = []
): ProjectedBalance {
  const targetDate = parseISO(targetWeekStartIso)
  const yearStart = startOfYear(targetDate)
  let cursor = startOfWeek(yearStart, { weekStartsOn: 1 })

  const weeks: WeekTotals[] = []
  let cumulativeDelta = 0
  let currentContractId: string | null = null

  while (!isAfter(cursor, targetDate)) {
    const iso = format(cursor, 'yyyy-MM-dd')
    const contract = contractAt(contracts, iso)
    if (contract && contract.id !== currentContractId) {
      currentContractId = contract.id
      cumulativeDelta = 0
    }
    const totals = weekTotals(employeeId, iso, shifts, contracts, absences, overtimeRequests)
    weeks.push(totals)
    if (contract) cumulativeDelta += totals.delta
    cursor = addWeeks(cursor, 1)
  }

  return { employeeId, asOfWeekStart: targetWeekStartIso, weeks, cumulativeDelta }
}

export function isBeforeToday(isoDate: string): boolean {
  return isBefore(parseISO(isoDate), new Date())
}
