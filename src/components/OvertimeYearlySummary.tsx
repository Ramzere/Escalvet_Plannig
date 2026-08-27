import { useMemo, useState } from 'react'
import { formatHours, overtimeHoursOf } from '../lib/hours'
import type { OvertimeRequest, Profile } from '../types'

export default function OvertimeYearlySummary({
  team,
  requests,
}: {
  team: Profile[]
  requests: OvertimeRequest[]
}) {
  const currentYear = new Date().getFullYear()
  const years = useMemo(() => {
    const fromData = requests.map((r) => new Date(r.work_date).getFullYear())
    const all = new Set([currentYear, ...fromData])
    return Array.from(all).sort((a, b) => b - a)
  }, [requests, currentYear])

  const [year, setYear] = useState(currentYear)

  const rows = team.map((member) => {
    const ofMember = requests.filter(
      (r) => r.employee_id === member.id && new Date(r.work_date).getFullYear() === year
    )
    const approved = ofMember
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + overtimeHoursOf(r), 0)
    const pendingCount = ofMember.filter((r) => r.status === 'pending').length
    const rejected = ofMember
      .filter((r) => r.status === 'rejected')
      .reduce((sum, r) => sum + overtimeHoursOf(r), 0)
    return { member, approved, pendingCount, rejected }
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-brand-900">Résumé des heures sup par an</h2>
          <p className="text-xs text-brand-700/60">Total des heures sup validées pour chacun.</p>
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
      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ member, approved, pendingCount, rejected }) => (
          <div key={member.id} className="flex flex-col gap-1 bg-white px-4 py-3">
            <p className="text-sm font-medium text-brand-900">{member.full_name}</p>
            <p className="text-lg font-semibold text-brand-700">
              {approved > 0 ? `+${formatHours(approved)}` : formatHours(0)}
            </p>
            <p className="text-[11px] text-brand-700/50">
              validées {year}
              {pendingCount > 0 && ` · ${pendingCount} en attente`}
              {rejected > 0 && ` · ${formatHours(rejected)} refusées`}
            </p>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="col-span-full bg-white px-4 py-6 text-center text-sm text-brand-700/60">
            Personne dans ce groupe pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  )
}
