import { useMemo, useState } from 'react'
import { format, parseISO, subWeeks } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { frenchError } from '../lib/errors'
import { formatHours, weekDays } from '../lib/hours'
import { publicHolidayName } from '../lib/holidays'
import {
  DEFAULT_ASV_TEMPLATE,
  evaluatePlan,
  generateWeekPlan,
  templateFromWeek,
  type AutoplanInput,
  type AutoplanResult,
  type SlotTemplate,
} from '../lib/autoplan'
import type { Absence, Contract, OvertimeRequest, Poste, Profile, Shift } from '../types'
import { POSTE_SHORT_LABELS } from '../types'
import ErrorBanner from './ErrorBanner'

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const POSTE_DOT: Record<Poste, string> = {
  bleu: 'bg-poste-bleu',
  violet: 'bg-poste-violet',
  vert: 'bg-poste-vert',
  seul: 'bg-poste-seul',
}

type TemplateSource = 'default' | 'previous'
type Strength = 'off' | 'soft' | 'strong'

const FULL_DAY_WEIGHT: Record<Strength, number> = { off: 0, soft: 2, strong: 6 }
const CATCH_UP_RATE: Record<Strength, number> = { off: 0, soft: 0.25, strong: 0.5 }

export default function AutoplanModal({
  weekStart,
  team,
  contracts,
  absences,
  overtimeRequests,
  yearShifts,
  onClose,
  onApplied,
}: {
  weekStart: string
  team: Profile[]
  contracts: Contract[]
  absences: Absence[]
  overtimeRequests: OvertimeRequest[]
  /** Créneaux depuis le 1er janvier jusqu'à la fin de la semaine affichée. */
  yearShifts: Shift[]
  onClose: () => void
  onApplied: () => void
}) {
  const days = weekDays(weekStart).map((d) => format(d, 'yyyy-MM-dd'))
  const previousWeek = format(subWeeks(parseISO(weekStart), 1), 'yyyy-MM-dd')
  const teamIds = useMemo(() => new Set(team.map((t) => t.id)), [team])

  const weekShifts = useMemo(
    () => yearShifts.filter((s) => days.includes(s.work_date) && teamIds.has(s.employee_id)),
    [yearShifts, days, teamIds]
  )
  const historyShifts = useMemo(
    () => yearShifts.filter((s) => s.work_date < days[0]),
    [yearShifts, days]
  )
  const previousTemplate = useMemo(
    () =>
      templateFromWeek(
        yearShifts.filter((s) => teamIds.has(s.employee_id)),
        previousWeek
      ),
    [yearShifts, teamIds, previousWeek]
  )

  const hasContract = (id: string) => contracts.some((c) => c.employee_id === id)

  const [source, setSource] = useState<TemplateSource>(
    previousTemplate.length > 0 ? 'previous' : 'default'
  )
  const [fullDays, setFullDays] = useState<Strength>('strong')
  const [catchUp, setCatchUp] = useState<Strength>('soft')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(team.filter((t) => hasContract(t.id)).map((t) => t.id))
  )
  const [seed, setSeed] = useState(1)
  const [result, setResult] = useState<AutoplanResult | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slots: SlotTemplate[] = source === 'previous' ? previousTemplate : DEFAULT_ASV_TEMPLATE
  const withPostes = team.some((t) => t.group_name === 'asv')

  function buildInput(nextSeed: number): AutoplanInput {
    return {
      weekStart,
      slots,
      withPostes,
      people: team.filter((t) => selected.has(t.id)),
      contracts,
      absences,
      overtimeRequests,
      historyShifts,
      options: {
        seed: nextSeed,
        fullDayWeight: FULL_DAY_WEIGHT[fullDays],
        catchUpRate: CATCH_UP_RATE[catchUp],
      },
    }
  }

  function generate(nextSeed = seed) {
    setError(null)
    setSeed(nextSeed)
    setResult(generateWeekPlan(buildInput(nextSeed)))
  }

  /** Modification à la main d'un créneau : on réévalue soldes, postes et conflits. */
  function assign(slotIndex: number, employeeId: string | null) {
    if (!result) return
    const edited = [...result.assignment]
    edited[slotIndex] = employeeId
    setResult(evaluatePlan(buildInput(seed), result.slots, edited))
  }

  const hasConflicts = !!result && result.conflicts.length > 0
  const absenceStatusOn = (employeeId: string, dayIso: string) =>
    absences.find(
      (a) =>
        a.employee_id === employeeId &&
        a.status !== 'rejected' &&
        a.start_date <= dayIso &&
        dayIso <= a.end_date
    )?.status

  /** Seuls les créneaux des personnes cochées sont remplacés ; les autres restent intacts. */
  const replacedShifts = weekShifts.filter((s) => selected.has(s.employee_id))
  const replacedNames = [...new Set(replacedShifts.map((s) => nameOf(s.employee_id)))].sort()

  async function apply() {
    if (!result) return
    if (hasConflicts) {
      setError('Une personne est placée deux fois sur la même demi-journée : corrige avant d’appliquer.')
      return
    }
    if (
      replacedShifts.length > 0 &&
      !window.confirm(
        `Les ${replacedShifts.length} créneau(x) déjà présents cette semaine pour ${replacedNames.join(', ')} seront remplacés par la proposition. Continuer ?`
      )
    ) {
      return
    }
    setApplying(true)
    setError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (replacedShifts.length > 0) {
      const { error: delError } = await supabase
        .from('shifts')
        .delete()
        .in(
          'id',
          replacedShifts.map((s) => s.id)
        )
      if (delError) {
        setApplying(false)
        setError(frenchError(delError.message, 'Suppression des anciens créneaux impossible'))
        return
      }
    }
    const rows = result.toShifts().map((s) => ({ ...s, created_by: user?.id }))
    const { error: insError } = await supabase.from('shifts').insert(rows)
    setApplying(false)
    if (insError) {
      setError(frenchError(insError.message, 'Enregistrement des créneaux impossible'))
      return
    }
    onApplied()
    onClose()
  }

  function nameOf(id: string | null) {
    if (!id) return '—'
    return team.find((t) => t.id === id)?.full_name ?? '?'
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setResult(null)
  }

  const tracks = [...new Set(slots.map((s) => s.track))].sort()

  /** Une case de la proposition : menu déroulant de personne + horaire + poste, avec ses alertes. */
  function renderSlot(i: number) {
    if (!result) return null
    const s = result.slots[i]
    const d = s.day
    const who = result.assignment[i]
    const otherPeriod = s.period === 'matin' ? 'apres-midi' : 'matin'
    const otherIdx = result.slots.findIndex(
      (o) => o.day === d && o.period === otherPeriod && o.track === s.track
    )
    const isolated =
      who !== null &&
      otherIdx !== -1 &&
      !result.slots.some(
        (o, j) => o.day === d && o.period === otherPeriod && result.assignment[j] === who
      )
    const conflict = result.conflicts.includes(i)
    const absent = result.unavailable.includes(i)
    const pendingAbs = result.pendingAbsence.includes(i)
    const style = conflict
      ? 'border-red-400 bg-red-50 text-red-800'
      : who === null
        ? 'border-dashed border-red-300 bg-red-50 text-red-700'
        : absent
          ? 'border-red-300 bg-red-50 text-red-800'
          : pendingAbs
            ? 'border-orange-400 bg-orange-50 text-orange-900'
            : isolated
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-sand-200 bg-sand-50 text-brand-900'
    const title = conflict
      ? 'Déjà placée sur cette demi-journée'
      : absent
        ? 'Absente ce jour-là'
        : pendingAbs
          ? 'A demandé une absence ce jour-là (pas encore validée)'
          : isolated
            ? 'Demi-journée isolée'
            : undefined
    const poste = result.postes[i]
    return (
      <div key={`${d}-${s.period}-${s.track}`} className={`rounded-md border px-1.5 py-1 ${style}`} title={title}>
        <select
          value={who ?? ''}
          onChange={(e) => assign(i, e.target.value || null)}
          className="w-full bg-transparent font-semibold outline-none"
          aria-label={`${DAY_LABELS[d]} ${s.period} ${s.start}-${s.end}`}
        >
          <option value="">—</option>
          {team
            .filter((t) => selected.has(t.id) || t.id === who)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
                {absenceStatusOn(t.id, days[d]) === 'approved'
                  ? ' (absente)'
                  : absenceStatusOn(t.id, days[d]) === 'pending'
                    ? ' (demande en attente)'
                    : ''}
              </option>
            ))}
        </select>
        <p className="opacity-70">
          {s.start}–{s.end}
        </p>
        {poste && (
          <p className="mt-0.5 flex items-center gap-1 opacity-80">
            <span className={`inline-block h-2 w-2 rounded-full ${POSTE_DOT[poste]}`} />
            {POSTE_SHORT_LABELS[poste]}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-900/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[95svh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-sand-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-brand-900">Proposer un planning</h2>
            <p className="text-xs text-brand-700/60">
              Semaine du {format(parseISO(weekStart), 'd MMMM yyyy', { locale: fr })} · le
              générateur respecte les absences, vise le contrat de chacune et privilégie les
              journées entières. Tu pourras tout retoucher après.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-brand-700/60 hover:bg-sand-100"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <ErrorBanner message={error} />

          <div className="grid gap-4 sm:grid-cols-3">
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-brand-900">Créneaux horaires</legend>
              <label className="flex items-start gap-2 text-sm text-brand-900">
                <input
                  type="radio"
                  name="source"
                  className="mt-1"
                  checked={source === 'previous'}
                  disabled={previousTemplate.length === 0}
                  onChange={() => {
                    setSource('previous')
                    setResult(null)
                  }}
                />
                <span>
                  Mêmes horaires que la semaine précédente
                  <span className="block text-xs text-brand-700/50">
                    {previousTemplate.length > 0
                      ? `${previousTemplate.length} créneaux`
                      : 'aucun créneau la semaine dernière'}
                  </span>
                </span>
              </label>
              <label className="mt-1.5 flex items-start gap-2 text-sm text-brand-900">
                <input
                  type="radio"
                  name="source"
                  className="mt-1"
                  checked={source === 'default'}
                  onChange={() => {
                    setSource('default')
                    setResult(null)
                  }}
                />
                <span>
                  Semaine type ASV
                  <span className="block text-xs text-brand-700/50">
                    8h-13h et 14h30-19h au chenil/chir, 8h15-12h30 et 14h30-19h30 à l&apos;accueil,
                    jeudi décalé, samedi matin. Une personne seule = tous les postes.
                  </span>
                </span>
              </label>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-brand-900">Personnes à planifier</legend>
              <div className="space-y-1">
                {team.map((t) => {
                  const noContract = !hasContract(t.id)
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2 text-sm ${noContract ? 'text-brand-700/40' : 'text-brand-900'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        disabled={noContract}
                        onChange={() => toggle(t.id)}
                      />
                      {t.full_name}
                      {noContract && <span className="text-xs">(pas de contrat)</span>}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-brand-900">Préférences</legend>
              <label className="block text-sm text-brand-900">
                <span className="block text-xs text-brand-700/60">Journées entières</span>
                <select
                  value={fullDays}
                  onChange={(e) => {
                    setFullDays(e.target.value as Strength)
                    setResult(null)
                  }}
                  className="mt-0.5 w-full rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                >
                  <option value="strong">Priorité forte</option>
                  <option value="soft">Si possible</option>
                  <option value="off">Indifférent</option>
                </select>
              </label>
              <label className="block text-sm text-brand-900">
                <span className="block text-xs text-brand-700/60">Rattrapage du cumul annuel</span>
                <select
                  value={catchUp}
                  onChange={(e) => {
                    setCatchUp(e.target.value as Strength)
                    setResult(null)
                  }}
                  className="mt-0.5 w-full rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                >
                  <option value="soft">Doux (≤ 3h par semaine)</option>
                  <option value="strong">Fort</option>
                  <option value="off">Aucun</option>
                </select>
              </label>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => generate(result ? seed + 1 : seed)}
              disabled={selected.size === 0 || slots.length === 0}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {result ? 'Proposer une autre variante' : 'Générer la proposition'}
            </button>
            {replacedShifts.length > 0 && (
              <span className="text-xs text-amber-800">
                Appliquer remplacera les {replacedShifts.length} créneau(x) déjà présents de{' '}
                {replacedNames.join(', ')}. Les autres personnes ne sont pas touchées.
              </span>
            )}
          </div>

          {result && (
            <>
              <p className="text-xs text-brand-700/60">
                Tu peux changer la personne de n&apos;importe quel créneau directement dans la
                grille : les soldes et les postes se recalculent aussitôt.
              </p>
              {result.unfilled > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {result.unfilled} créneau(x) sans personne. Choisis quelqu&apos;un dans la grille
                  ou laisse « — » pour les compléter plus tard.
                </p>
              )}
              {hasConflicts && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  Une personne est placée deux fois sur la même demi-journée (cases rouges).
                  Corrige avant d&apos;appliquer.
                </p>
              )}
              {result.pendingAbsence.length > 0 && (
                <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  Une personne est placée un jour où elle a demandé une absence pas encore
                  validée (cases orange). Valide ou refuse la demande, ou change la personne.
                </p>
              )}
              {result.unavailable.length > 0 && !hasConflicts && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  Attention : une personne est placée un jour où elle est absente (cases rouges).
                  Tu peux quand même appliquer si c&apos;est voulu.
                </p>
              )}

              <div className="hidden overflow-x-auto rounded-xl border border-sand-200 sm:block">
                <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
                  <thead>
                    <tr className="bg-sand-50 text-left text-brand-700/70">
                      <th className="w-16 px-2 py-1.5 font-medium">&nbsp;</th>
                      {days.map((iso, d) => (
                        <th key={iso} className="border-l border-sand-200 px-2 py-1.5 font-medium">
                          {DAY_LABELS[d]}{' '}
                          <span className="font-normal text-brand-700/50">
                            {format(parseISO(iso), 'd/MM')}
                          </span>
                          {publicHolidayName(iso) && (
                            <span className="block font-normal text-brand-700/50">Férié · fermé</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(['matin', 'apres-midi'] as const).map((period) => (
                      <tr key={period} className="border-t border-sand-100 align-top">
                        <td className="px-2 py-1.5 font-medium text-brand-700/70">
                          {period === 'matin' ? 'Matin' : 'Après-midi'}
                        </td>
                        {days.map((_, d) => (
                          <td key={d} className="border-l border-sand-100 px-2 py-1.5">
                            <div className="space-y-1">
                              {tracks.map((track) => {
                                const i = result.slots.findIndex(
                                  (s) => s.day === d && s.period === period && s.track === track
                                )
                                return i === -1 ? null : renderSlot(i)
                              })}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 sm:hidden">
                {days.map((iso, d) => {
                  const ofDay = result.slots.map((_, i) => i).filter((i) => result.slots[i].day === d)
                  return (
                    <div key={iso} className="overflow-hidden rounded-xl border border-sand-200 text-xs">
                      <div className="bg-sand-50 px-3 py-1.5 font-medium text-brand-900">
                        {DAY_LABELS[d]} {format(parseISO(iso), 'd/MM')}
                        {publicHolidayName(iso) && (
                          <span className="font-normal text-brand-700/50"> · Férié · fermé</span>
                        )}
                      </div>
                      {ofDay.length === 0 ? (
                        <p className="px-3 py-2 text-brand-700/40">Fermé</p>
                      ) : (
                        (['matin', 'apres-midi'] as const).map((period) => {
                          const ofPeriod = ofDay.filter((i) => result.slots[i].period === period)
                          if (ofPeriod.length === 0) return null
                          return (
                            <div key={period} className="border-t border-sand-100 px-3 py-2">
                              <p className="mb-1 text-[11px] font-medium text-brand-700/60">
                                {period === 'matin' ? 'Matin' : 'Après-midi'}
                              </p>
                              <div className="space-y-1">{ofPeriod.map((i) => renderSlot(i))}</div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-px overflow-hidden rounded-xl border border-sand-200 bg-sand-100 sm:grid-cols-2 lg:grid-cols-4">
                {result.people.map((p) => {
                  const delta = p.hours - p.theoreticalHours
                  return (
                    <div key={p.employeeId} className="bg-white px-3 py-2 text-xs">
                      <p className="text-sm font-medium text-brand-900">{nameOf(p.employeeId)}</p>
                      <p className="text-brand-700/70">
                        {formatHours(p.hours)} sur {formatHours(p.theoreticalHours)} prévues
                        {p.absentDays > 0 && ` (${p.absentDays}j d'absence)`}
                      </p>
                      <p className="text-brand-700/70">
                        Semaine : {delta >= 0 ? '+' : ''}
                        {formatHours(delta)} · cumul {formatHours(p.cumulBefore)} →{' '}
                        <span className="font-medium text-brand-900">{formatHours(p.cumulAfter)}</span>
                      </p>
                      <p className="text-brand-700/50">
                        {p.fullDays} journée(s) entière(s)
                        {p.halfDays > 0 && `, ${p.halfDays} demi-journée(s) isolée(s)`}
                        {p.worksSaturday && ' · samedi'}
                      </p>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-sand-200 pt-3">
                <button
                  onClick={onClose}
                  className="rounded-lg px-3 py-1.5 text-sm text-brand-700/70 hover:bg-sand-100"
                >
                  Annuler
                </button>
                <button
                  onClick={apply}
                  disabled={applying || hasConflicts}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {applying ? 'Application…' : 'Appliquer cette proposition'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
