import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { OvertimeRequest, OvertimeStatus, Profile } from '../types'
import ErrorBanner from './ErrorBanner'

const STATUS_LABEL: Record<OvertimeStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
}

export default function OvertimeHistoryPanel({
  team,
  requests,
  onChanged,
}: {
  team: Profile[]
  requests: OvertimeRequest[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const history = requests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1))

  function nameOf(employeeId: string) {
    return team.find((t) => t.id === employeeId)?.full_name ?? '—'
  }

  async function update(id: string, fields: Partial<Pick<OvertimeRequest, 'hours' | 'minutes' | 'status'>>) {
    setBusy(id)
    setError(null)
    const { error } = await supabase
      .from('overtime_requests')
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
    setBusy(id)
    setError(null)
    const { error } = await supabase.from('overtime_requests').delete().eq('id', id)
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
        <h2 className="text-sm font-semibold text-brand-900">Historique des heures sup</h2>
        <p className="text-xs text-brand-700/60">
          Toutes les déclarations validées ou refusées. Modifiable à tout moment.
        </p>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="divide-y divide-sand-100">
        {history.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
          >
            <div>
              <p className="font-medium text-brand-900">
                {nameOf(r.employee_id)} ·{' '}
                <span className="font-normal text-brand-700/70">
                  {format(new Date(r.work_date), 'EEEE d MMM yyyy', { locale: fr })}
                </span>
              </p>
              {r.note && <p className="text-xs text-brand-700/60">{r.note}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                value={r.hours}
                disabled={busy === r.id}
                onChange={(e) => update(r.id, { hours: Number(e.target.value) })}
                className="w-14 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1 text-xs outline-none focus:border-brand-400"
              />
              <span className="text-xs text-brand-700/60">h</span>
              <input
                type="number"
                min="0"
                max="59"
                value={r.minutes}
                disabled={busy === r.id}
                onChange={(e) => update(r.id, { minutes: Number(e.target.value) })}
                className="w-14 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1 text-xs outline-none focus:border-brand-400"
              />
              <span className="text-xs text-brand-700/60">min</span>
              <select
                value={r.status}
                disabled={busy === r.id}
                onChange={(e) => update(r.id, { status: e.target.value as OvertimeStatus })}
                className={`rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ${
                  r.status === 'approved'
                    ? 'bg-brand-100 text-brand-700'
                    : r.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {(Object.keys(STATUS_LABEL) as OvertimeStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => remove(r.id)}
                disabled={busy === r.id}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {history.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-brand-700/60">
            Aucune déclaration validée ou refusée pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  )
}
