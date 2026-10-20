import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAbsences, useOvertimeRequests, useTeam } from '../hooks/usePlanningData'
import { formatHours, overtimeHoursOf } from '../lib/hours'
import { formatDays, leaveDaysOf } from '../lib/leave'
import type { Absence, OvertimeRequest, Profile } from '../types'
import Collapsible from '../components/Collapsible'
import ErrorBanner from '../components/ErrorBanner'
import StatusBadge from '../components/StatusBadge'

type Kind = 'all' | 'overtime' | 'absence'
type StatusFilter = 'all' | 'approved' | 'rejected' | 'pending'

const STATUS_WORDS: Record<string, string> = {
  pending: 'en attente',
  approved: 'validée',
  rejected: 'refusée',
}

function monthKey(iso: string) {
  return iso.slice(0, 7)
}
function monthLabel(key: string) {
  const label = format(parseISO(`${key}-01`), 'MMMM yyyy', { locale: fr })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
function dateLabel(iso: string) {
  return format(parseISO(iso), 'EEE d MMM', { locale: fr })
}
function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Historique complet (propriétaire) : heures sup et absences de toute
 * l'équipe, avec recherche, filtres, et sections repliables par mois.
 */
export default function HistoryPage() {
  const { team } = useTeam()
  const { requests: overtime, reload: reloadOvertime } = useOvertimeRequests()
  const { absences, reload: reloadAbsences } = useAbsences()

  const [query, setQuery] = useState('')
  const [employeeId, setEmployeeId] = useState<string>('all')
  const [year, setYear] = useState<string>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nameOf = (id: string) => team.find((t) => t.id === id)?.full_name ?? '—'

  const years = useMemo(() => {
    const all = new Set<string>()
    overtime.forEach((r) => all.add(r.work_date.slice(0, 4)))
    absences.forEach((a) => all.add(a.start_date.slice(0, 4)))
    return Array.from(all).sort().reverse()
  }, [overtime, absences])

  const q = normalize(query.trim())
  const matchesText = (parts: (string | null | undefined)[]) =>
    q === '' || normalize(parts.filter(Boolean).join(' ')).includes(q)

  const filteredOvertime = useMemo(
    () =>
      overtime
        .filter((r) => employeeId === 'all' || r.employee_id === employeeId)
        .filter((r) => year === 'all' || r.work_date.startsWith(year))
        .filter((r) => status === 'all' || r.status === status)
        .filter((r) =>
          matchesText([
            nameOf(r.employee_id),
            r.note,
            r.admin_note,
            STATUS_WORDS[r.status],
            dateLabel(r.work_date),
            r.work_date,
            formatHours(overtimeHoursOf(r)),
          ])
        )
        .sort((a, b) => (a.work_date < b.work_date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overtime, employeeId, year, status, q, team]
  )

  const filteredAbsences = useMemo(
    () =>
      absences
        .filter((a) => employeeId === 'all' || a.employee_id === employeeId)
        .filter((a) => year === 'all' || a.start_date.startsWith(year) || a.end_date.startsWith(year))
        .filter((a) => status === 'all' || a.status === status)
        .filter((a) =>
          matchesText([
            nameOf(a.employee_id),
            a.reason,
            STATUS_WORDS[a.status],
            a.counts_as_leave ? 'congés' : 'hors congés',
            a.admin_note,
            dateLabel(a.start_date),
            dateLabel(a.end_date),
            a.start_date,
            a.end_date,
          ])
        )
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [absences, employeeId, year, status, q, team]
  )

  function groupByMonth<T>(items: T[], dateOf: (t: T) => string) {
    const groups = new Map<string, T[]>()
    for (const item of items) {
      const key = monthKey(dateOf(item))
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : -1))
  }

  async function run(id: string, action: () => PromiseLike<{ error: { message: string } | null }>, reload: () => void) {
    setBusy(id)
    setError(null)
    const { error } = await action()
    setBusy(null)
    if (error) {
      setError(error.message)
      return
    }
    reload()
  }

  const setOvertimeStatus = (r: OvertimeRequest, next: 'approved' | 'rejected') =>
    run(
      r.id,
      () =>
        supabase
          .from('overtime_requests')
          .update({ status: next, decided_at: new Date().toISOString() })
          .eq('id', r.id),
      reloadOvertime
    )
  const deleteOvertime = (r: OvertimeRequest) => {
    if (!window.confirm('Supprimer définitivement cette déclaration d’heures sup ?')) return
    run(r.id, () => supabase.from('overtime_requests').delete().eq('id', r.id), reloadOvertime)
  }
  const setAbsenceStatus = (a: Absence, next: 'approved' | 'rejected') =>
    run(
      a.id,
      () =>
        supabase
          .from('absences')
          .update({ status: next, decided_at: new Date().toISOString() })
          .eq('id', a.id),
      reloadAbsences
    )
  const deleteAbsence = (a: Absence) => {
    if (!window.confirm('Supprimer définitivement cette absence ?')) return
    run(a.id, () => supabase.from('absences').delete().eq('id', a.id), reloadAbsences)
  }

  const approvedOvertimeHours = filteredOvertime
    .filter((r) => r.status === 'approved')
    .reduce((s, r) => s + overtimeHoursOf(r), 0)
  const approvedLeaveDays = filteredAbsences
    .filter((a) => a.status === 'approved' && a.counts_as_leave)
    .reduce((s, a) => s + leaveDaysOf(a, Number(a.start_date.slice(0, 4))), 0)

  const hasFilters = query !== '' || employeeId !== 'all' || year !== 'all' || kind !== 'all' || status !== 'all'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-brand-900">Historique</h1>
        <p className="text-xs text-brand-700/60">
          Toutes les heures sup et absences de l&apos;équipe. Cherche un nom, un motif, une
          date, un statut… puis affine avec les filtres.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-sand-200 bg-white p-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher : Clara, école, 11 nov, refusée, 2h30…"
          className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          >
            <option value="all">Toute l&apos;équipe</option>
            {[...team]
              .sort((a, b) => a.full_name.localeCompare(b.full_name))
              .map((t: Profile) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                  {t.active ? '' : ' (inactif)'}
                </option>
              ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
          >
            <option value="all">Toutes les années</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap rounded-lg border border-sand-300 bg-white p-0.5 text-sm">
            {(
              [
                ['all', 'Tout'],
                ['overtime', 'Heures sup'],
                ['absence', 'Absences'],
              ] as [Kind, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md px-2.5 py-1 ${
                  kind === k ? 'bg-brand-600 text-white' : 'text-brand-700 hover:bg-sand-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap rounded-lg border border-sand-300 bg-white p-0.5 text-sm">
            {(
              [
                ['all', 'Tous statuts'],
                ['approved', 'Validées'],
                ['pending', 'En attente'],
                ['rejected', 'Refusées'],
              ] as [StatusFilter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setStatus(k)}
                className={`rounded-md px-2.5 py-1 ${
                  status === k ? 'bg-brand-600 text-white' : 'text-brand-700 hover:bg-sand-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={() => {
                setQuery('')
                setEmployeeId('all')
                setYear('all')
                setKind('all')
                setStatus('all')
              }}
              className="px-2 text-xs font-medium text-brand-700 hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      {kind !== 'absence' && (
        <Collapsible
          title="Heures supplémentaires"
          subtitle={`${filteredOvertime.length} déclaration(s) · ${formatHours(approvedOvertimeHours)} validées`}
          aside={filteredOvertime.length === 0 ? undefined : `${filteredOvertime.length}`}
        >
          {filteredOvertime.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-brand-700/60">
              Aucune heure sup ne correspond.
            </p>
          ) : (
            groupByMonth(filteredOvertime, (r) => r.work_date).map(([key, items]) => (
              <Collapsible
                key={key}
                level="group"
                title={monthLabel(key)}
                aside={`${items.length} · ${formatHours(
                  items.filter((r) => r.status === 'approved').reduce((s, r) => s + overtimeHoursOf(r), 0)
                )} validées`}
              >
                <div className="divide-y divide-sand-100">
                  {items.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-brand-900">
                          {nameOf(r.employee_id)}
                          <span className="font-normal text-brand-700/70">
                            {' '}
                            · {dateLabel(r.work_date)} · {formatHours(overtimeHoursOf(r))}
                          </span>
                        </p>
                        {(r.note || r.admin_note) && (
                          <p className="text-xs text-brand-700/60">
                            {r.note}
                            {r.note && r.admin_note && ' · '}
                            {r.admin_note && <span className="italic">réponse : {r.admin_note}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {r.status !== 'approved' && (
                          <button
                            onClick={() => setOvertimeStatus(r, 'approved')}
                            disabled={busy === r.id}
                            className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                          >
                            Valider
                          </button>
                        )}
                        {r.status !== 'rejected' && (
                          <button
                            onClick={() => setOvertimeStatus(r, 'rejected')}
                            disabled={busy === r.id}
                            className="text-xs font-medium text-amber-800 hover:underline disabled:opacity-50"
                          >
                            Refuser
                          </button>
                        )}
                        <button
                          onClick={() => deleteOvertime(r)}
                          disabled={busy === r.id}
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Collapsible>
            ))
          )}
        </Collapsible>
      )}

      {kind !== 'overtime' && (
        <Collapsible
          title="Absences"
          subtitle={`${filteredAbsences.length} absence(s) · ${formatDays(approvedLeaveDays)} de congés validés`}
          aside={filteredAbsences.length === 0 ? undefined : `${filteredAbsences.length}`}
        >
          {filteredAbsences.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-brand-700/60">
              Aucune absence ne correspond.
            </p>
          ) : (
            groupByMonth(filteredAbsences, (a) => a.start_date).map(([key, items]) => (
              <Collapsible key={key} level="group" title={monthLabel(key)} aside={`${items.length}`}>
                <div className="divide-y divide-sand-100">
                  {items.map((a) => {
                    const days = leaveDaysOf(a, Number(a.start_date.slice(0, 4))) +
                      (a.end_date.slice(0, 4) !== a.start_date.slice(0, 4)
                        ? leaveDaysOf(a, Number(a.end_date.slice(0, 4)))
                        : 0)
                    return (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-brand-900">
                            {nameOf(a.employee_id)}
                            <span className="font-normal text-brand-700/70">
                              {' '}
                              · {dateLabel(a.start_date)}
                              {a.end_date !== a.start_date && ` → ${dateLabel(a.end_date)}`} ·{' '}
                              {formatDays(days)}
                            </span>
                          </p>
                          <p className="text-xs text-brand-700/60">
                            {a.reason}
                            {' · '}
                            {a.counts_as_leave ? 'décompté des congés' : 'hors congés'}
                            {a.admin_note && <span className="italic"> · réponse : {a.admin_note}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={a.status} />
                          {a.status !== 'approved' && (
                            <button
                              onClick={() => setAbsenceStatus(a, 'approved')}
                              disabled={busy === a.id}
                              className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                            >
                              Valider
                            </button>
                          )}
                          {a.status !== 'rejected' && (
                            <button
                              onClick={() => setAbsenceStatus(a, 'rejected')}
                              disabled={busy === a.id}
                              className="text-xs font-medium text-amber-800 hover:underline disabled:opacity-50"
                            >
                              Refuser
                            </button>
                          )}
                          <button
                            onClick={() => deleteAbsence(a)}
                            disabled={busy === a.id}
                            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Collapsible>
            ))
          )}
        </Collapsible>
      )}
    </div>
  )
}
