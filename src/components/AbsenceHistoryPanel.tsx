import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Absence, AbsenceStatus, Profile } from '../types'
import ErrorBanner from './ErrorBanner'

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
}

export default function AbsenceHistoryPanel({
  team,
  requests,
  onChanged,
}: {
  team: Profile[]
  requests: Absence[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const history = requests
    .filter((a) => a.status !== 'pending')
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

  function nameOf(employeeId: string) {
    return team.find((t) => t.id === employeeId)?.full_name ?? '—'
  }

  async function update(id: string, fields: Partial<Pick<Absence, 'status' | 'start_date' | 'end_date'>>) {
    setBusy(id)
    setError(null)
    const { error } = await supabase
      .from('absences')
      .update({ ...fields, decided_at: new Date().toISOString() })
      .eq('id', id)
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer définitivement cette absence ?')) return
    setBusy(id)
    setError(null)
    const { error } = await supabase.from('absences').delete().eq('id', id)
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">Historique des absences</h2>
        <p className="text-xs text-brand-700/60">
          Toutes les absences validées ou refusées. Modifiable à tout moment.
        </p>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="divide-y divide-sand-100">
        {history.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
          >
            <div>
              <p className="font-medium text-brand-900">
                {nameOf(a.employee_id)} ·{' '}
                <span className="font-normal text-brand-700/70">
                  {new Date(a.start_date).toLocaleDateString('fr-FR')} →{' '}
                  {new Date(a.end_date).toLocaleDateString('fr-FR')}
                </span>
              </p>
              {a.reason && <p className="text-xs text-brand-700/60">{a.reason}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={a.start_date}
                disabled={busy === a.id}
                onChange={(e) => update(a.id, { start_date: e.target.value })}
                className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1 text-xs outline-none focus:border-brand-400"
              />
              <span className="text-xs text-brand-700/60">→</span>
              <input
                type="date"
                value={a.end_date}
                disabled={busy === a.id}
                onChange={(e) => update(a.id, { end_date: e.target.value })}
                className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1 text-xs outline-none focus:border-brand-400"
              />
              <select
                value={a.status}
                disabled={busy === a.id}
                onChange={(e) => update(a.id, { status: e.target.value as AbsenceStatus })}
                className={`rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ${
                  a.status === 'approved'
                    ? 'bg-brand-100 text-brand-700'
                    : a.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {(Object.keys(STATUS_LABEL) as AbsenceStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => remove(a.id)}
                disabled={busy === a.id}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {history.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-brand-700/60">
            Aucune absence validée ou refusée pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  )
}
