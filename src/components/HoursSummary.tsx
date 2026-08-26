import type { Contract, Profile, Shift, WeeklyAbsence } from '../types'
import { formatHours, projectedBalance, weekTotals } from '../lib/hours'

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 1 / 60) {
    return (
      <span className="rounded-full bg-sand-200 px-2 py-0.5 text-xs font-medium text-brand-700">
        À l&apos;heure
      </span>
    )
  }
  const positive = delta > 0
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        positive ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {positive ? '+' : ''}
      {formatHours(delta)} {positive ? 'en plus' : 'en moins'}
    </span>
  )
}

export default function HoursSummary({
  team,
  weekStart,
  shifts,
  yearShifts,
  contracts,
  absences,
}: {
  team: Profile[]
  weekStart: string
  shifts: Shift[]
  yearShifts: Shift[]
  contracts: Contract[]
  absences: WeeklyAbsence[]
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">Solde d&apos;heures</h2>
        <p className="text-xs text-brand-700/60">
          Cette semaine et cumul prévisionnel depuis le 1er janvier
        </p>
      </div>
      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 lg:grid-cols-4">
        {team.map((member) => {
          const wt = weekTotals(member.id, weekStart, shifts, contracts, absences)
          const projection = projectedBalance(member.id, weekStart, yearShifts, contracts, absences)
          return (
            <div key={member.id} className="flex flex-col gap-1 bg-white px-4 py-3">
              <p className="text-sm font-medium text-brand-900">{member.full_name}</p>
              <p className="text-xs text-brand-700/60">
                {wt.isAbsentWeek
                  ? 'Absent(e) cette semaine'
                  : `${formatHours(wt.actualHours)} sur ${formatHours(wt.theoreticalHours)} prévues`}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <DeltaBadge delta={wt.delta} />
                <span className="text-[11px] text-brand-700/50">
                  Cumul {new Date(weekStart).getFullYear()} : {formatHours(projection.cumulativeDelta)}
                </span>
              </div>
            </div>
          )
        })}
        {team.length === 0 && (
          <p className="col-span-full bg-white px-4 py-6 text-center text-sm text-brand-700/60">
            Personne dans ce groupe pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  )
}
