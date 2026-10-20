import { formatDays, leaveSummary } from '../lib/leave'
import type { Absence, LeaveBalance } from '../types'

/** Compteur de congés d'une personne pour l'année en cours (vue employé). */
export default function LeaveCounter({
  employeeId,
  absences,
  balances,
}: {
  employeeId: string
  absences: Absence[]
  balances: LeaveBalance[]
}) {
  const year = new Date().getFullYear()
  const s = leaveSummary(employeeId, year, absences, balances)
  const used = s.taken + s.planned
  const total = s.entitlement + s.carryOver
  const ratio = total > 0 ? Math.min(1, Math.max(0, used / total)) : 0

  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-brand-900">Mes congés {year}</h2>
        <p className="text-sm">
          <span
            className={`text-lg font-semibold ${s.remaining < 0 ? 'text-red-700' : 'text-brand-700'}`}
          >
            {formatDays(s.remaining)}
          </span>
          <span className="text-brand-700/60"> restants sur {formatDays(total)}</span>
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-brand-700/60">
        {formatDays(s.taken)} pris · {formatDays(s.planned)} à venir
        {s.pending > 0 && ` · ${formatDays(s.pending)} en attente de validation`}
        {s.carryOver !== 0 && ` · dont ${formatDays(s.carryOver)} reportés de ${year - 1}`}
      </p>
      <p className="mt-1 text-[11px] text-brand-700/50">
        En jours ouvrables (lundi → samedi). Seules les absences « congés » validées sont
        décomptées.
      </p>
    </div>
  )
}
