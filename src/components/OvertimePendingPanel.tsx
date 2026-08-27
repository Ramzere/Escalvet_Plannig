import { useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { formatHours, overtimeHoursOf } from '../lib/hours'
import type { OvertimeRequest, Profile } from '../types'

export default function OvertimePendingPanel({
  team,
  requests,
  onChanged,
}: {
  team: Profile[]
  requests: OvertimeRequest[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const pending = requests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => (a.work_date < b.work_date ? -1 : 1))

  function nameOf(employeeId: string) {
    return team.find((t) => t.id === employeeId)?.full_name ?? '—'
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    setBusy(id)
    await supabase
      .from('overtime_requests')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
    setBusy(null)
    onChanged()
  }

  if (pending.length === 0) return null

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50">
      <div className="border-b border-amber-200 bg-amber-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">
          Heures supplémentaires à valider
          <span className="ml-2 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white">
            {pending.length}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-amber-200">
        {pending.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-brand-900">
                {nameOf(r.employee_id)} ·{' '}
                <span className="font-normal text-brand-700/70">
                  {format(new Date(r.work_date), 'EEEE d MMM', { locale: fr })}
                </span>{' '}
                · <span className="font-semibold">+{formatHours(overtimeHoursOf(r))}</span>
              </p>
              {r.note && <p className="text-xs text-brand-700/60">{r.note}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decide(r.id, 'approved')}
                disabled={busy === r.id}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Valider
              </button>
              <button
                onClick={() => decide(r.id, 'rejected')}
                disabled={busy === r.id}
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
