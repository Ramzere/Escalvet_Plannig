import { useMemo, useState } from 'react'
import { addDays, format, startOfYear } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { useAbsences, useContracts, useShiftsRange, useTeam } from '../hooks/usePlanningData'
import { weekDays, weekStartOf } from '../lib/hours'
import type { Group, Period, Shift } from '../types'
import WeekNavigator from '../components/WeekNavigator'
import ShiftPill from '../components/ShiftPill'
import ShiftEditorModal from '../components/ShiftEditorModal'
import HoursSummary from '../components/HoursSummary'
import AbsenceBar from '../components/AbsenceBar'

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

  const days = weekDays(weekStart)
  const rangeFrom = format(startOfYear(new Date(weekStart)), 'yyyy-MM-dd')
  const rangeTo = format(addDays(days[days.length - 1], 0), 'yyyy-MM-dd')

  const { team, loading: teamLoading } = useTeam()
  const { contracts } = useContracts()
  const { absences, reload: reloadAbsences } = useAbsences()
  const { shifts: yearShifts, reload: reloadShifts } = useShiftsRange(rangeFrom, rangeTo)

  const visibleTeam = useMemo(
    () => team.filter((t) => t.active && t.group_name === groupFilter),
    [team, groupFilter]
  )

  const weekShifts = useMemo(() => {
    const isoDays = days.map((d) => format(d, 'yyyy-MM-dd'))
    return yearShifts.filter((s) => isoDays.includes(s.work_date))
  }, [yearShifts, days])

  function shiftsFor(workDateIso: string, period: Period) {
    return weekShifts.filter(
      (s) =>
        s.work_date === workDateIso &&
        s.period === period &&
        visibleTeam.some((t) => t.id === s.employee_id)
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

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-2xl border border-sand-200 bg-white">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-24 border-b border-sand-200 bg-sand-50 px-3 py-2 text-left text-xs font-medium text-brand-700/70">
                  &nbsp;
                </th>
                {days.map((d, i) => (
                  <th
                    key={i}
                    className="border-b border-l border-sand-200 bg-sand-50 px-3 py-2 text-left text-xs font-medium text-brand-900"
                  >
                    {DAY_LABELS[i]}
                    <span className="block font-normal text-brand-700/60">
                      {format(d, 'd MMM', { locale: fr })}
                    </span>
                  </th>
                ))}
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
                    return (
                      <td key={i} className="border-b border-l border-sand-100 px-2 py-2">
                        <div className="space-y-1.5">
                          {dayShifts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {dayShifts.map((s) => (
                                <ShiftPill
                                  key={s.id}
                                  shift={s}
                                  employeeName={nameOf(s.employee_id)}
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

        <HoursSummary
          team={visibleTeam}
          weekStart={weekStart}
          shifts={weekShifts}
          yearShifts={yearShifts}
          contracts={contracts}
          absences={absences}
        />
      </div>

      {teamLoading && <p className="text-sm text-brand-700/50">Chargement de l&apos;équipe…</p>}

      {editing && (
        <ShiftEditorModal
          workDate={editing.workDate}
          period={editing.period}
          team={visibleTeam}
          existing={editing.shift}
          onClose={() => setEditing(null)}
          onSaved={reloadShifts}
        />
      )}
    </div>
  )
}
