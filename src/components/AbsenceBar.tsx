import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Absence, Profile } from '../types'
import { weekDays } from '../lib/hours'
import { format } from 'date-fns'
import ErrorBanner from './ErrorBanner'

export default function AbsenceBar({
  team,
  weekStart,
  absences,
  isOwner,
  onChanged,
}: {
  team: Profile[]
  weekStart: string
  absences: Absence[]
  isOwner: boolean
  onChanged: () => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Absence | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekDatesIso = weekDays(weekStart).map((d) => format(d, 'yyyy-MM-dd'))
  const teamIds = new Set(team.map((t) => t.id))
  const weekAbsences = absences.filter(
    (a) =>
      teamIds.has(a.employee_id) &&
      a.start_date <= weekDatesIso[weekDatesIso.length - 1] &&
      a.end_date >= weekDatesIso[0]
  )
  const absentIds = new Set(weekAbsences.map((a) => a.employee_id))

  function nameOf(employeeId: string) {
    return team.find((t) => t.id === employeeId)?.full_name ?? '—'
  }

  async function saveAbsence(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const employee_id = String(form.get('employee_id'))
    const start_date = String(form.get('start_date'))
    const end_date = String(form.get('end_date'))
    const reason = String(form.get('reason') || 'Congés')
    if (!employee_id || !start_date || !end_date) {
      setBusy(false)
      return
    }
    if (end_date < start_date) {
      setError('La date de fin doit être après la date de début.')
      setBusy(false)
      return
    }
    const { error } = editing
      ? await supabase
          .from('absences')
          .update({ employee_id, start_date, end_date, reason })
          .eq('id', editing.id)
      : await supabase.from('absences').insert({ employee_id, start_date, end_date, reason })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    ;(e.target as HTMLFormElement).reset()
    setFormOpen(false)
    setEditing(null)
    onChanged()
  }

  function openEdit(a: Absence) {
    setEditing(a)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
  }

  async function deleteAbsence(id: string) {
    if (!window.confirm('Supprimer cette absence ?')) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('absences').delete().eq('id', id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    if (editing?.id === id) closeForm()
    onChanged()
  }

  if (!isOwner) {
    if (absentIds.size === 0) return null
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
        En congé/absent(e) cette semaine :{' '}
        {team
          .filter((t) => absentIds.has(t.id))
          .map((t) => t.full_name)
          .join(', ')}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-brand-700/70">
          Absences (congés, repos...) — réduisent les heures théoriques au prorata des jours
        </p>
        <button
          onClick={() => (formOpen ? closeForm() : setFormOpen(true))}
          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
        >
          {formOpen ? 'Annuler' : '+ Ajouter une absence'}
        </button>
      </div>

      <ErrorBanner message={error} />

      {formOpen && (
        <form
          key={editing?.id ?? 'new'}
          onSubmit={saveAbsence}
          className="mb-3 flex flex-wrap items-end gap-2"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-900">Personne</label>
            <select
              name="employee_id"
              required
              defaultValue={editing?.employee_id ?? team[0]?.id ?? ''}
              className="w-40 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
            >
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-900">Du</label>
            <input
              name="start_date"
              type="date"
              required
              defaultValue={editing?.start_date ?? weekDatesIso[0]}
              className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-900">Au</label>
            <input
              name="end_date"
              type="date"
              required
              defaultValue={editing?.end_date ?? weekDatesIso[0]}
              className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-900">Motif</label>
            <input
              name="reason"
              placeholder="Congés"
              defaultValue={editing?.reason ?? 'Congés'}
              className="w-32 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {editing ? 'Modifier' : 'Enregistrer'}
          </button>
        </form>
      )}

      {weekAbsences.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {weekAbsences.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
            >
              <button
                onClick={() => openEdit(a)}
                disabled={busy}
                className="hover:underline"
              >
                {nameOf(a.employee_id)} · {a.reason} ({new Date(a.start_date).toLocaleDateString('fr-FR')}
                {' → '}
                {new Date(a.end_date).toLocaleDateString('fr-FR')})
              </button>
              <button
                onClick={() => deleteAbsence(a.id)}
                disabled={busy}
                className="text-amber-700 hover:text-amber-900"
                aria-label="Supprimer"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
