import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Period, Poste, Profile, Shift } from '../types'
import { POSTE_SHORT_LABELS } from '../types'

const POSTE_OPTIONS: Poste[] = ['bleu', 'violet', 'vert', 'seul']

const POSTE_DOT: Record<Poste, string> = {
  bleu: 'bg-poste-bleu',
  violet: 'bg-poste-violet',
  vert: 'bg-poste-vert',
  seul: 'bg-poste-seul',
}

export default function ShiftEditorModal({
  workDate,
  period,
  team,
  existing,
  onClose,
  onSaved,
}: {
  workDate: string
  period: Period
  team: Profile[]
  existing: Shift | null
  onClose: () => void
  onSaved: () => void
}) {
  const [employeeId, setEmployeeId] = useState(existing?.employee_id ?? team[0]?.id ?? '')
  const [startTime, setStartTime] = useState(
    existing?.start_time.slice(0, 5) ?? (period === 'matin' ? '08:00' : '14:30')
  )
  const [endTime, setEndTime] = useState(
    existing?.end_time.slice(0, 5) ?? (period === 'matin' ? '13:00' : '19:30')
  )
  const [poste, setPoste] = useState<Poste>(existing?.poste ?? 'bleu')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!employeeId) {
      setError('Choisis une personne.')
      return
    }
    if (endTime <= startTime) {
      setError("L'heure de fin doit être après l'heure de début.")
      return
    }
    setSaving(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const payload = {
      employee_id: employeeId,
      work_date: workDate,
      period,
      start_time: startTime,
      end_time: endTime,
      poste,
      created_by: user?.id,
    }

    const { error } = existing
      ? await supabase.from('shifts').update(payload).eq('id', existing.id)
      : await supabase.from('shifts').insert(payload)

    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
    onClose()
  }

  async function handleDelete() {
    if (!existing) return
    setSaving(true)
    const { error } = await supabase.from('shifts').delete().eq('id', existing.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-brand-900">
          {existing ? 'Modifier le créneau' : 'Ajouter un créneau'}
        </h2>
        <p className="mb-4 text-xs text-brand-700/60">
          {period === 'matin' ? 'Matin' : 'Après-midi'} · {workDate}
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-900">Personne</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-brand-900">Début</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-brand-900">Fin</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-brand-900">Poste</label>
            <div className="grid grid-cols-2 gap-2">
              {POSTE_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPoste(p)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                    poste === p
                      ? 'border-brand-400 ring-2 ring-brand-200'
                      : 'border-sand-300 hover:bg-sand-50'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${POSTE_DOT[p]}`} />
                  {POSTE_SHORT_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div>
            {existing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-brand-700/70 hover:bg-sand-100"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
