import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDays, leaveSummary } from '../lib/leave'
import type { Absence, LeaveBalance, Profile } from '../types'
import ErrorBanner from './ErrorBanner'
import { frenchError } from '../lib/errors'

/**
 * Bilan des congés de toute l'équipe pour une année (vue propriétaire) :
 * jours acquis et report modifiables, jours pris / à venir / en attente et
 * solde restant calculés depuis les absences validées.
 */
export default function LeaveBalancePanel({
  team,
  absences,
  balances,
  onChanged,
}: {
  team: Profile[]
  absences: Absence[]
  balances: LeaveBalance[]
  onChanged: () => void
}) {
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const all = new Set<number>([currentYear, currentYear + 1])
    absences.forEach((a) => {
      all.add(Number(a.start_date.slice(0, 4)))
      all.add(Number(a.end_date.slice(0, 4)))
    })
    balances.forEach((b) => all.add(b.year))
    return Array.from(all).sort((a, b) => b - a)
  }, [absences, balances, currentYear])

  const [year, setYear] = useState(currentYear)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const rows = team
    .filter((t) => t.active)
    .map((member) => ({ member, s: leaveSummary(member.id, year, absences, balances) }))

  async function save(employeeId: string, field: 'entitlement' | 'carry_over', raw: string) {
    const value = Number(raw.replace(',', '.'))
    if (Number.isNaN(value)) return
    const existing = balances.find((b) => b.employee_id === employeeId && b.year === year)
    const current = existing ? Number(existing[field]) : field === 'entitlement' ? 30 : 0
    if (value === current) return
    setSaving(`${employeeId}-${field}`)
    setError(null)
    const { error } = await supabase.from('leave_balances').upsert(
      {
        employee_id: employeeId,
        year,
        entitlement: field === 'entitlement' ? value : (existing?.entitlement ?? 30),
        carry_over: field === 'carry_over' ? value : (existing?.carry_over ?? 0),
      },
      { onConflict: 'employee_id,year' }
    )
    setSaving(null)
    if (error) {
      setError(frenchError(error.message, 'Enregistrement impossible'))
      return
    }
    onChanged()
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">Congés de l&apos;équipe</h2>
          <p className="text-xs text-brand-700/60">
            Jours ouvrables (lundi → samedi). Acquis et report sont modifiables ; le reste est
            calculé depuis les absences validées marquées « congés ».
          </p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-sand-50 text-left text-xs font-medium text-brand-700/70">
              <th className="px-4 py-2">Personne</th>
              <th className="px-2 py-2">Acquis</th>
              <th className="px-2 py-2">Report</th>
              <th className="px-2 py-2">Pris</th>
              <th className="px-2 py-2">À venir</th>
              <th className="px-2 py-2">En attente</th>
              <th className="px-4 py-2 text-right">Restant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-100">
            {rows.map(({ member, s }) => (
              <tr key={member.id}>
                <td className="px-4 py-2 font-medium text-brand-900">{member.full_name}</td>
                <td className="px-2 py-2">
                  <input
                    key={`${member.id}-${year}-e-${s.entitlement}`}
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={s.entitlement}
                    disabled={saving === `${member.id}-entitlement`}
                    onBlur={(e) => save(member.id, 'entitlement', e.target.value)}
                    className="w-20 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1 text-sm outline-none focus:border-brand-400"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    key={`${member.id}-${year}-c-${s.carryOver}`}
                    type="number"
                    step="0.5"
                    defaultValue={s.carryOver}
                    disabled={saving === `${member.id}-carry_over`}
                    onBlur={(e) => save(member.id, 'carry_over', e.target.value)}
                    className="w-20 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1 text-sm outline-none focus:border-brand-400"
                  />
                </td>
                <td className="px-2 py-2 text-brand-900">{formatDays(s.taken)}</td>
                <td className="px-2 py-2 text-brand-700/80">{formatDays(s.planned)}</td>
                <td className="px-2 py-2 text-amber-800">{s.pending > 0 ? formatDays(s.pending) : '—'}</td>
                <td
                  className={`px-4 py-2 text-right font-semibold ${
                    s.remaining < 0 ? 'text-red-700' : 'text-brand-700'
                  }`}
                >
                  {formatDays(s.remaining)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-brand-700/60">
                  Personne dans l&apos;équipe pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
