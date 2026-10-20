import { useMemo, useState } from 'react'
import { addDays, format, isToday, startOfYear } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import {
  useAbsences,
  useContracts,
  useLeaveBalances,
  useOvertimeRequests,
  useShiftsRange,
  useTeam,
} from '../hooks/usePlanningData'
import { weekDays, weekStartOf } from '../lib/hours'
import { publicHolidayName } from '../lib/holidays'
import type { Group, Period, Shift } from '../types'
import WeekNavigator from '../components/WeekNavigator'
import ShiftPill from '../components/ShiftPill'
import ShiftEditorModal from '../components/ShiftEditorModal'
import HoursSummary from '../components/HoursSummary'
import AbsenceBar from '../components/AbsenceBar'
import AbsenceRequestForm from '../components/AbsenceRequestForm'
import OvertimeForm from '../components/OvertimeForm'
import PosteLegend from '../components/PosteLegend'
import AutoplanModal from '../components/AutoplanModal'
import LeaveCounter from '../components/LeaveCounter'

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const PERIODS: { key: Period; label: string }[] = [
  { key: 'matin', label: 'Matin' },
  { key: 'apres-midi', label: 'Après-midi' },
]

export default function PlanningPage() {
  const { profile } = useAuth()
  const [weekStart, setWeekStart] = useState(weekStartOf(new Date()))
  const [groupFilter, setGroupFilter] = useState<Group>(profile?.group_name ?? 'asv')
  const [editing, setEditing] = useState<{
    workDate: string
    period: Period
    shift: Shift | null
  } | null>(null)
  const [autoplanOpen, setAutoplanOpen] = useState(false)

  const days = weekDays(weekStart)
  const rangeFrom = format(startOfYear(new Date(weekStart)), 'yyyy-MM-dd')
  const rangeTo = format(addDays(days[days.length - 1], 0), 'yyyy-MM-dd')

  const { team, loading: teamLoading } = useTeam()
  const { contracts } = useContracts()
  const { absences, reload: reloadAbsences } = useAbsences()
  const { shifts: yearShifts, reload: reloadShifts } = useShiftsRange(rangeFrom, rangeTo)
  const { requests: overtimeRequests, reload: reloadOvertime } = useOvertimeRequests()
  const { balances: leaveBalances } = useLeaveBalances()

  const visibleTeam = useMemo(
    () => team.filter((t) => t.active && t.group_name === groupFilter),
    [team, groupFilter]
  )
  // Les créneaux des comptes désactivés restent visibles (en grisé) pour ne
  // pas trouer l'historique des semaines passées.
  const groupTeam = useMemo(() => team.filter((t) => t.group_name === groupFilter), [team, groupFilter])
  const isInactive = (employeeId: string) => !team.find((t) => t.id === employeeId)?.active

  const weekShifts = useMemo(() => {
    const isoDays = days.map((d) => format(d, 'yyyy-MM-dd'))
    return yearShifts.filter((s) => isoDays.includes(s.work_date))
  }, [yearShifts, days])

  function shiftsFor(workDateIso: string, period: Period) {
    return weekShifts.filter(
      (s) =>
        s.work_date === workDateIso &&
        s.period === period &&
        groupTeam.some((t) => t.id === s.employee_id)
    )
  }

  function nameOf(employeeId: string) {
    return team.find((t) => t.id === employeeId)?.full_name ?? '—'
  }

  const isOwner = !!profile?.is_owner
  const hasBothGroups = team.some((t) => t.group_name === 'asv') && team.some((t) => t.group_name === 'veterinaire')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />
        {isOwner && (
          <button
            onClick={() => setAutoplanOpen(true)}
            className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            ✨ Proposer un planning
          </button>
        )}
        {isOwner && hasBothGroups && (
          <div className="flex rounded-lg border border-sand-300 bg-white p-1 text-sm">
            {(['asv', 'veterinaire'] as Group[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupFilter(g)}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  groupFilter === g ? 'bg-brand-600 text-white' : 'text-brand-700 hover:bg-sand-100'
                }`}
              >
                {g === 'asv' ? 'ASV' : 'Vétérinaires'}
              </button>
            ))}
          </div>
        )}
      </div>

      <AbsenceBar
        team={visibleTeam}
        weekStart={weekStart}
        absences={absences}
        isOwner={isOwner}
        onChanged={reloadAbsences}
      />

      <div className="space-y-4">
        <div className="hidden overflow-x-auto rounded-2xl border border-sand-200 bg-white sm:block">
          <table className="w-full min-w-[1080px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-24 border-b border-sand-200 bg-sand-50 px-3 py-2 text-left text-xs font-medium text-brand-700/70">
                  &nbsp;
                </th>
                {days.map((d, i) => {
                  const holiday = publicHolidayName(format(d, 'yyyy-MM-dd'))
                  return (
                    <th
                      key={i}
                      className={`w-40 border-b border-l px-3 py-2 text-left text-xs font-medium ${
                        isToday(d)
                          ? 'border-brand-200 bg-brand-100 text-brand-900'
                          : holiday
                            ? 'border-sand-200 bg-sand-100 text-brand-700/60'
                            : 'border-sand-200 bg-sand-50 text-brand-900'
                      }`}
                    >
                      {DAY_LABELS[i]}
                      {isToday(d) && (
                        <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Aujourd&apos;hui
                        </span>
                      )}
                      {holiday && (
                        <span className="ml-1.5 rounded-full bg-sand-300 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                          Férié
                        </span>
                      )}
                      <span className="block font-normal text-brand-700/60">
                        {format(d, 'd MMM', { locale: fr })}
                        {holiday && ` · ${holiday}`}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period) => (
                <tr key={period.key} className="align-top">
                  <td className="border-b border-sand-100 px-3 py-3 text-xs font-medium text-brand-700/70">
                    {period.label}
                  </td>
                  {days.map((d, i) => {
                    const iso = format(d, 'yyyy-MM-dd')
                    const dayShifts = shiftsFor(iso, period.key)
                    const holiday = publicHolidayName(iso)
                    if (holiday && dayShifts.length === 0) {
                      return (
                        <td key={i} className="border-b border-l border-sand-100 bg-sand-50 px-2 py-2">
                          <p className="py-1.5 text-center text-xs text-brand-700/40">Fermé</p>
                        </td>
                      )
                    }
                    return (
                      <td
                        key={i}
                        className={`border-b border-l px-2 py-2 ${
                          isToday(d)
                            ? 'border-sand-100 bg-brand-50/40'
                            : 'border-sand-100'
                        }`}
                      >
                        <div className="space-y-1.5">
                          {dayShifts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {dayShifts.map((s) => (
                                <ShiftPill
                                  key={s.id}
                                  shift={s}
                                  employeeName={nameOf(s.employee_id)}
                                  inactive={isInactive(s.employee_id)}
                                  onClick={
                                    isOwner
                                      ? () => setEditing({ workDate: iso, period: period.key, shift: s })
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          )}
                          {isOwner && (
                            <button
                              onClick={() =>
                                setEditing({ workDate: iso, period: period.key, shift: null })
                              }
                              className="w-full rounded-lg border border-dashed border-sand-300 py-1.5 text-xs text-brand-700/50 hover:border-brand-300 hover:text-brand-600"
                            >
                              + ajouter
                            </button>
                          )}
                          {!isOwner && dayShifts.length === 0 && (
                            <p className="py-1.5 text-center text-xs text-brand-700/30">—</p>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 sm:hidden">
          {days.map((d, i) => {
            const iso = format(d, 'yyyy-MM-dd')
            const today = isToday(d)
            const holiday = publicHolidayName(iso)
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-2xl border bg-white ${
                  today ? 'border-brand-300' : 'border-sand-200'
                }`}
              >
                <div
                  className={`flex items-center gap-2 border-b px-3 py-2 text-sm font-medium ${
                    today
                      ? 'border-brand-200 bg-brand-100 text-brand-900'
                      : 'border-sand-200 bg-sand-50 text-brand-900'
                  }`}
                >
                  <span>
                    {DAY_LABELS[i]} <span className="font-normal text-brand-700/60">{format(d, 'd MMM', { locale: fr })}</span>
                  </span>
                  {today && (
                    <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Aujourd&apos;hui
                    </span>
                  )}
                  {holiday && (
                    <span className="rounded-full bg-sand-300 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                      Férié · {holiday}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-sand-100">
                  {PERIODS.map((period) => {
                    const dayShifts = shiftsFor(iso, period.key)
                    if (holiday && dayShifts.length === 0) {
                      return (
                        <div key={period.key} className="px-3 py-2.5 text-center text-xs text-brand-700/40">
                          Fermé
                        </div>
                      )
                    }
                    return (
                      <div key={period.key} className="px-3 py-2.5">
                        <p className="mb-1.5 text-xs font-medium text-brand-700/70">
                          {period.label}
                        </p>
                        <div className="space-y-1.5">
                          {dayShifts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {dayShifts.map((s) => (
                                <ShiftPill
                                  key={s.id}
                                  shift={s}
                                  employeeName={nameOf(s.employee_id)}
                                  inactive={isInactive(s.employee_id)}
                                  onClick={
                                    isOwner
                                      ? () => setEditing({ workDate: iso, period: period.key, shift: s })
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          )}
                          {isOwner && (
                            <button
                              onClick={() =>
                                setEditing({ workDate: iso, period: period.key, shift: null })
                              }
                              className="w-full rounded-lg border border-dashed border-sand-300 py-1.5 text-xs text-brand-700/50 hover:border-brand-300 hover:text-brand-600"
                            >
                              + ajouter
                            </button>
                          )}
                          {!isOwner && dayShifts.length === 0 && (
                            <p className="py-1 text-center text-xs text-brand-700/30">—</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {groupFilter === 'asv' && <PosteLegend />}

        <HoursSummary
          team={isOwner ? visibleTeam : visibleTeam.filter((t) => t.id === profile?.id)}
          personal={!isOwner}
          weekStart={weekStart}
          shifts={weekShifts}
          yearShifts={yearShifts}
          contracts={contracts}
          absences={absences}
          overtimeRequests={overtimeRequests}
        />

        {!isOwner && profile && (
          <LeaveCounter employeeId={profile.id} absences={absences} balances={leaveBalances} />
        )}

        {!isOwner && profile && (
          <AbsenceRequestForm
            employeeId={profile.id}
            requests={absences}
            onChanged={reloadAbsences}
          />
        )}

        {!isOwner && profile && (
          <OvertimeForm
            employeeId={profile.id}
            weekStart={weekStart}
            requests={overtimeRequests}
            onChanged={reloadOvertime}
          />
        )}
      </div>

      {teamLoading && <p className="text-sm text-brand-700/50">Chargement de l&apos;équipe…</p>}

      {autoplanOpen && (
        <AutoplanModal
          weekStart={weekStart}
          team={visibleTeam}
          contracts={contracts}
          absences={absences}
          overtimeRequests={overtimeRequests}
          yearShifts={yearShifts}
          onClose={() => setAutoplanOpen(false)}
          onApplied={reloadShifts}
        />
      )}

      {editing && (
        <ShiftEditorModal
          workDate={editing.workDate}
          period={editing.period}
          team={
            editing.shift && isInactive(editing.shift.employee_id)
              ? [...visibleTeam, ...groupTeam.filter((t) => t.id === editing.shift?.employee_id)]
              : visibleTeam
          }
          existing={editing.shift}
          siblings={shiftsFor(editing.workDate, editing.period)}
          onClose={() => setEditing(null)}
          onSaved={reloadShifts}
        />
      )}
    </div>
  )
}
