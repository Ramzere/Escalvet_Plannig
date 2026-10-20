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

/** Jours ouvrables (ISO) couverts par une absence pour une année donnée. */
function leaveDayKeys(absence: Pick<Absence, 'start_date' | 'end_date'>, year: number): string[] {
  const keys: string[] = []
  let cursor = parseISO(absence.start_date)
  const end = parseISO(absence.end_date)
  while (cursor <= end) {
    const iso = format(cursor, 'yyyy-MM-dd')
    if (cursor.getFullYear() === year && cursor.getDay() !== 0 && !isPublicHoliday(iso)) keys.push(iso)
    cursor = addDays(cursor, 1)
  }
  return keys
}

/**
 * Absences (non refusées) d'une personne qui chevauchent la période donnée.
 * Sert à refuser une saisie en double avant de l'envoyer.
 */
export function overlappingAbsences(
  absences: Absence[],
  employeeId: string,
  startDate: string,
  endDate: string,
  ignoreId?: string
): Absence[] {
  return absences.filter(
    (a) =>
      a.employee_id === employeeId &&
      a.id !== ignoreId &&
      a.status !== 'rejected' &&
      a.start_date <= endDate &&
      startDate <= a.end_date
  )
}

/**
 * Un motif d'absence qui, par nature, ne consomme pas de congés : école
 * (alternance), arrêt maladie, formation, férié, sans solde, fin de contrat.
 * Même liste que la migration du schéma SQL.
 */
export function reasonCountsAsLeave(reason: string): boolean {
  return !/(école|ecole|arr[êe]t|maladie|formation|f[ée]ri[ée]|sans solde|fin de contrat)/i.test(reason)
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

  // Chaque jour n'est compté qu'une fois, même si deux absences se chevauchent.
  const takenDays = new Set<string>()
  const plannedDays = new Set<string>()
  const pendingDays = new Set<string>()
  for (const a of absences) {
    if (a.employee_id !== employeeId || !a.counts_as_leave || a.status === 'rejected') continue
    for (const day of leaveDayKeys(a, year)) {
      if (a.status === 'pending') pendingDays.add(day)
      else if (day < todayIso) takenDays.add(day)
      else plannedDays.add(day)
    }
  }
  // Un jour validé n'est pas aussi « en attente ».
  for (const d of takenDays) pendingDays.delete(d)
  for (const d of plannedDays) pendingDays.delete(d)
  const taken = takenDays.size
  const planned = plannedDays.size
  return {
    employeeId,
    year,
    entitlement,
    carryOver,
    taken,
    planned,
    pending: pendingDays.size,
    remaining: entitlement + carryOver - taken - planned,
    isDefault: !balance,
  }
}

/** Formate un nombre de jours : 12 → "12 j", 2.5 → "2,5 j". */
export function formatDays(days: number): string {
  const rounded = Math.round(days * 2) / 2
  return `${rounded.toLocaleString('fr-FR')} j`
}
