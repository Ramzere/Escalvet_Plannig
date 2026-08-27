import { useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { formatHours, overtimeHoursOf, weekDays } from '../lib/hours'
import type { OvertimeRequest, OvertimeStatus } from '../types'
import ErrorBanner from './ErrorBanner'

const STATUS_LABEL: Record<OvertimeStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
}

const STATUS_STYLE: Record<OvertimeStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-brand-100 text-brand-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function OvertimeForm({
  employeeId,
  weekStart,
  requests,
  onChanged,
}: {
  employeeId: string
  weekStart: string
  requests: OvertimeRequest[]
  onChanged: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const days = weekDays(weekStart)
  const dayIsos = days.map((d) => format(d, 'yyyy-MM-dd'))

  const myWeekRequests = requests
    .filter((r) => r.employee_id === employeeId && dayIsos.includes(r.work_date))
    .sort((a, b) => (a.work_date < b.work_date ? -1 : 1))

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const work_date = String(form.get('work_date') || dayIsos[0])
    const hours = Number(form.get('hours') || 0)
    const minutes = Number(form.get('minutes') || 0)
    const note = String(form.get('note') || '').trim()
    if (hours <= 0 && minutes <= 0) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('overtime_requests').insert({
      employee_id: employeeId,
      work_date,
      hours,
      minutes,
      note: note || null,
    })
    setSubmitting(false)
    if (error) {
      setError("La déclaration n'a pas pu être envoyée, réessaie.")
      return
    }
    ;(e.target as HTMLFormElement).reset()
    onChanged()
  }

  async function cancel(id: string) {
    setError(null)
    const { error } = await supabase.from('overtime_requests').delete().eq('id', id)
    if (error) {
      setError("L'annulation n'a pas pu être enregistrée, réessaie.")
      return
    }
    onChanged()
  }

  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-brand-900">Heures supplémentaires</h2>
      <p className="mb-3 text-xs text-brand-700/60">
        Déclare tes heures sup faites cette semaine. Elles ne compteront dans ton solde qu&apos;une
        fois validées par le/la propriétaire.
      </p>

      <ErrorBanner message={error} />

      <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-900">Jour</label>
          <select
            name="work_date"
            defaultValue={dayIsos[0]}
            className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          >
            {days.map((d, i) => (
              <option key={dayIsos[i]} value={dayIsos[i]}>
                {format(d, 'EEEE d MMM', { locale: fr })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-900">Heures</label>
          <input
            name="hours"
            type="number"
            min="0"
            step="1"
            defaultValue={0}
            className="w-20 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-900">Minutes</label>
          <input
            name="minutes"
            type="number"
            min="0"
            max="59"
            step="5"
            defaultValue={0}
            className="w-20 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <div className="flex-1 basis-40">
          <label className="mb-1 block text-xs font-medium text-brand-900">Note (optionnel)</label>
          <input
            name="note"
            placeholder="Ex : garde imprévue"
            className="w-full rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>

      {myWeekRequests.length > 0 && (
        <div className="divide-y divide-sand-100 border-t border-sand-100 pt-2">
          {myWeekRequests.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <div>
                <span className="font-medium text-brand-900">
                  {format(new Date(r.work_date), 'EEEE d MMM', { locale: fr })}
                </span>{' '}
                <span className="text-brand-700/70">+{formatHours(overtimeHoursOf(r))}</span>
                {r.note && <span className="text-brand-700/50"> · {r.note}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
                {r.status === 'pending' && (
                  <button
                    onClick={() => cancel(r.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Annuler
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
