import { addDays, format, parseISO } from 'date-fns'
import type { Absence, LeaveBalance } from '../types'
import { DEFAULT_LEAVE_ENTITLEMENT } from '../types'
import { isPublicHoliday } from './holidays'

/**
 * Jours ouvrables (lundi → samedi) d'une absence tombant dans une année
 * donnée. Les dimanches et les jours fériés ne comptent pas, comme sur les
 * plannings papier où un CP du vendredi au samedi vaut 2 jours.
 */
export function leaveDaysOf(absence: Pick<Absence, 'start_date' | 'end_date'>, year: number): number {
  let cursor = parseISO(absence.start_date)
  const end = parseISO(absence.end_date)
  let days = 0
  while (cursor <= end) {
    if (cursor.getFullYear() === year && cursor.getDay() !== 0 && !isPublicHoliday(format(cursor, 'yyyy-MM-dd'))) {
      days++
    }
    cursor = addDays(cursor, 1)
  }
  return days
}

export interface LeaveSummary {
  employeeId: string
  year: number
  entitlement: number
  carryOver: number
  /** Jours validés déjà passés (fin de l'absence avant aujourd'hui). */
  taken: number
  /** Jours validés à venir. */
  planned: number
  /** Jours demandés, pas encore validés. */
  pending: number
  /** entitlement + carryOver - taken - planned. */
  remaining: number
  /** Vrai si aucun droit n'a été saisi pour cette année (valeurs par défaut). */
  isDefault: boolean
}

/** Bilan des congés d'un employé pour une année civile. */
export function leaveSummary(
  employeeId: string,
  year: number,
  absences: Absence[],
  balances: LeaveBalance[],
  today: Date = new Date()
): LeaveSummary {
  const balance = balances.find((b) => b.employee_id === employeeId && b.year === year)
  const entitlement = balance ? Number(balance.entitlement) : DEFAULT_LEAVE_ENTITLEMENT
  const carryOver = balance ? Number(balance.carry_over) : 0
  const todayIso = format(today, 'yyyy-MM-dd')

  let taken = 0
  let planned = 0
  let pending = 0
  for (const a of absences) {
    if (a.employee_id !== employeeId || !a.counts_as_leave || a.status === 'rejected') continue
    const days = leaveDaysOf(a, year)
    if (days === 0) continue
    if (a.status === 'pending') pending += days
    else if (a.end_date < todayIso) taken += days
    else planned += days
  }
  return {
    employeeId,
    year,
    entitlement,
    carryOver,
    taken,
    planned,
    pending,
    remaining: entitlement + carryOver - taken - planned,
    isDefault: !balance,
  }
}

/** Formate un nombre de jours : 12 → "12 j", 2.5 → "2,5 j". */
export function formatDays(days: number): string {
  const rounded = Math.round(days * 2) / 2
  return `${rounded.toLocaleString('fr-FR')} j`
}
