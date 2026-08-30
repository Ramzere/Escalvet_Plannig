import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, WeeklyAbsence } from '../types'
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
  absences: WeeklyAbsence[]
  isOwner: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const weekDatesIso = weekDays(weekStart).map((d) => format(d, 'yyyy-MM-dd'))
  const teamIds = new Set(team.map((t) => t.id))
  const weekAbsences = absences.filter(
    (a) =>
      teamIds.has(a.employee_id) &&
      a.start_date <= weekDatesIso[weekDatesIso.length - 1] &&
      a.end_date >= weekDatesIso[0]
  )

  if (!isOwner && absentIds.size === 0) return null

  async function toggle(employeeId: string) {
    setBusy(employeeId)
    setError(null)
    const { error } = absentIds.has(employeeId)
      ? await supabase
          .from('weekly_absences')
          .delete()
          .eq('employee_id', employeeId)
          .eq('week_start', weekStart)
      : await supabase
          .from('weekly_absences')
          .insert({ employee_id: employeeId, week_start: weekStart, reason: 'Vacances' })
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    onChanged()
  }

  if (!isOwner) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
        En vacances/absent(e) cette semaine :{' '}
        {team
          .filter((t) => absentIds.has(t.id))
          .map((t) => t.full_name)
          .join(', ')}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-white px-4 py-3">
      <p className="mb-2 text-xs font-medium text-brand-700/70">
        Marquer une absence pour toute la semaine (exclue du calcul d&apos;heures)
      </p>
      <ErrorBanner message={error} />
      <div className="flex flex-wrap gap-2">
        {team.map((t) => {
          const absent = absentIds.has(t.id)
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              disabled={busy === t.id}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                absent
                  ? 'border-amber-300 bg-amber-100 text-amber-800'
                  : 'border-sand-300 bg-white text-brand-700/70 hover:bg-sand-50'
              }`}
            >
              {t.full_name}
              {absent ? ' · absent(e)' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
