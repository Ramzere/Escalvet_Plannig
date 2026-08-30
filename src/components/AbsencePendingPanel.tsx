import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Absence, Profile } from '../types'
import ErrorBanner from './ErrorBanner'

export default function AbsencePendingPanel({
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
  const pending = requests
    .filter((a) => a.status === 'pending')
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))

  function nameOf(employeeId: string) {
    return team.find((t) => t.id === employeeId)?.full_name ?? '—'
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(id)
    setError(null)
    const { error } = await supabase
      .from('absences')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  if (pending.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50">
      <div className="border-b border-amber-200 bg-amber-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">
          Demandes d&apos;absence à valider
          <span className="ml-2 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white">
            {pending.length}
          </span>
        </h2>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="divide-y divide-amber-200">
        {pending.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
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
            <div className="flex gap-2">
              <button
                onClick={() => decide(a.id, 'approved')}
                disabled={busy === a.id}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Valider
              </button>
              <button
                onClick={() => decide(a.id, 'rejected')}
                disabled={busy === a.id}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Refuser
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
