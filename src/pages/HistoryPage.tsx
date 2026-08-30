import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { useAbsences, useOvertimeRequests, useTeam } from '../hooks/usePlanningData'
import { formatHours, overtimeHoursOf } from '../lib/hours'
import OvertimeHistoryPanel from '../components/OvertimeHistoryPanel'
import AbsenceHistoryPanel from '../components/AbsenceHistoryPanel'
import StatusBadge from '../components/StatusBadge'

function MyOvertimeHistory({ employeeId }: { employeeId: string }) {
  const { requests } = useOvertimeRequests()
  const mine = requests
    .filter((r) => r.employee_id === employeeId)
    .sort((a, b) => (a.work_date < b.work_date ? 1 : -1))

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">Mes heures supplémentaires</h2>
      </div>
      <div className="divide-y divide-sand-100">
        {mine.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div>
              <span className="font-medium text-brand-900">
                {format(new Date(r.work_date), 'EEEE d MMM yyyy', { locale: fr })}
              </span>{' '}
              <span className="text-brand-700/70">+{formatHours(overtimeHoursOf(r))}</span>
              {r.note && <span className="text-brand-700/50"> · {r.note}</span>}
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
        {mine.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-brand-700/60">
            Aucune déclaration d&apos;heures sup pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  )
}

function MyAbsenceHistory({ employeeId }: { employeeId: string }) {
  const { absences } = useAbsences()
  const mine = absences
    .filter((a) => a.employee_id === employeeId)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <div className="border-b border-sand-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">Mes absences</h2>
      </div>
      <div className="divide-y divide-sand-100">
        {mine.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div>
              <span className="font-medium text-brand-900">
                {new Date(a.start_date).toLocaleDateString('fr-FR')} →{' '}
                {new Date(a.end_date).toLocaleDateString('fr-FR')}
              </span>
              {a.reason && <span className="text-brand-700/50"> · {a.reason}</span>}
            </div>
            <StatusBadge status={a.status} />
          </div>
        ))}
        {mine.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-brand-700/60">
            Aucune absence pour l&apos;instant.
          </p>
        )}
      </div>
    </div>
  )
}

function OwnerHistory() {
  const { team } = useTeam()
  const { requests: overtimeRequests, reload: reloadOvertime } = useOvertimeRequests()
  const { absences, reload: reloadAbsences } = useAbsences()

  return (
    <div className="space-y-4">
      <OvertimeHistoryPanel team={team} requests={overtimeRequests} onChanged={reloadOvertime} />
      <AbsenceHistoryPanel team={team} requests={absences} onChanged={reloadAbsences} />
    </div>
  )
}

export default function HistoryPage() {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-brand-900">Historique</h1>
        <p className="text-sm text-brand-700/60">
          {profile.is_owner
            ? "Toutes les heures sup et absences validées ou refusées de l'équipe."
            : 'Toutes tes heures sup et absences, quel que soit leur statut.'}
        </p>
      </div>

      {profile.is_owner ? (
        <OwnerHistory />
      ) : (
        <div className="space-y-4">
          <MyOvertimeHistory employeeId={profile.id} />
          <MyAbsenceHistory employeeId={profile.id} />
        </div>
      )}
    </div>
  )
}
