import { formatHours, projectedBalance, weekStartOf } from '../lib/hours'
import type { Contract, OvertimeRequest, Profile, Shift, WeeklyAbsence } from '../types'

export default function PreviousYearBalance({
  team,
  year,
  shifts,
  contracts,
  absences,
  overtimeRequests,
}: {
  team: Profile[]
  year: number
  shifts: Shift[]
  contracts: Contract[]
  absences: WeeklyAbsence[]
  overtimeRequests: OvertimeRequest[]
}) {
  const lastWeekOfYear = weekStartOf(new Date(year, 11, 31))

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">Bilan {year}</h2>
        <p className="text-xs text-brand-700/60">
          Solde final de l&apos;année écoulée, conservé comme trace avant la remise à zéro du 1er
          janvier.
        </p>
      </div>
      <div className="grid gap-px bg-sand-100 sm:grid-cols-2 lg:grid-cols-4">
        {team.map((member) => {
          const projection = projectedBalance(
            member.id,
            lastWeekOfYear,
            shifts,
            contracts,
            absences,
            overtimeRequests
          )
          const positive = projection.cumulativeDelta > 0
          const atZero = Math.abs(projection.cumulativeDelta) < 1 / 60
          return (
            <div key={member.id} className="flex flex-col gap-1 bg-white px-4 py-3">
              <p className="text-sm font-medium text-brand-900">{member.full_name}</p>
              <p
                className={`text-lg font-semibold ${
                  atZero ? 'text-brand-700/60' : positive ? 'text-brand-700' : 'text-amber-700'
                }`}
              >
                {atZero ? 'À l’heure' : `${positive ? '+' : ''}${formatHours(projection.cumulativeDelta)}`}
              </p>
              <p className="text-[11px] text-brand-700/50">
                {atZero ? '' : positive ? 'en plus au 31 décembre' : 'en moins au 31 décembre'}
              </p>
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
