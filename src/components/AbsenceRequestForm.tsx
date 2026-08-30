import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Absence, AbsenceStatus } from '../types'
import ErrorBanner from './ErrorBanner'

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
}

const STATUS_STYLE: Record<AbsenceStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-brand-100 text-brand-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function AbsenceRequestForm({
  employeeId,
  requests,
  onChanged,
}: {
  employeeId: string
  requests: Absence[]
  onChanged: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myRequests = requests
    .filter((a) => a.employee_id === employeeId)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const start_date = String(form.get('start_date'))
    const end_date = String(form.get('end_date'))
    const reason = String(form.get('reason') || 'Congés')
    if (!start_date || !end_date) return
    if (end_date < start_date) {
      setError('La date de fin doit être après la date de début.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('absences').insert({
      employee_id: employeeId,
      start_date,
      end_date,
      reason,
      status: 'pending',
    })
    setSubmitting(false)
    if (error) {
      setError("La demande n'a pas pu être envoyée, réessaie.")
      return
    }
    ;(e.target as HTMLFormElement).reset()
    onChanged()
  }

  async function cancel(id: string) {
    if (!window.confirm('Annuler cette demande d’absence ?')) return
    setError(null)
    const { error } = await supabase.from('absences').delete().eq('id', id)
    if (error) {
      setError("L'annulation n'a pas pu être enregistrée, réessaie.")
      return
    }
    onChanged()
  }

  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-brand-900">Demande d&apos;absence</h2>
      <p className="mb-3 text-xs text-brand-700/60">
        Demande des congés ou un jour de repos. Ça ne sera retiré de ton solde théorique qu&apos;une
        fois validé par le/la propriétaire.
      </p>

      <ErrorBanner message={error} />

      <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-900">Du</label>
          <input
            name="start_date"
            type="date"
            required
            className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-900">Au</label>
          <input
            name="end_date"
            type="date"
            required
            className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <div className="flex-1 basis-40">
          <label className="mb-1 block text-xs font-medium text-brand-900">Motif</label>
          <input
            name="reason"
            placeholder="Congés"
            defaultValue="Congés"
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

      {myRequests.length > 0 && (
        <div className="divide-y divide-sand-100 border-t border-sand-100 pt-2">
          {myRequests.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <div>
                <span className="font-medium text-brand-900">
                  {new Date(a.start_date).toLocaleDateString('fr-FR')} →{' '}
                  {new Date(a.end_date).toLocaleDateString('fr-FR')}
                </span>
                {a.reason && <span className="text-brand-700/50"> · {a.reason}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}
                >
                  {STATUS_LABEL[a.status]}
                </span>
                {a.status === 'pending' && (
                  <button
                    onClick={() => cancel(a.id)}
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
