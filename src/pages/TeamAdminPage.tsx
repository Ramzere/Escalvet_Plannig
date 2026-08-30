import { useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import {
  useAbsences,
  useContracts,
  useOvertimeRequests,
  useShiftsRange,
  useTeam,
} from '../hooks/usePlanningData'
import { formatHours } from '../lib/hours'
import { CONTRACT_TYPES } from '../types'
import type { ContractType, Group } from '../types'
import ErrorBanner from '../components/ErrorBanner'
import OvertimePendingPanel from '../components/OvertimePendingPanel'
import OvertimeHistoryPanel from '../components/OvertimeHistoryPanel'
import OvertimeYearlySummary from '../components/OvertimeYearlySummary'
import PreviousYearBalance from '../components/PreviousYearBalance'
import AbsencePendingPanel from '../components/AbsencePendingPanel'
import AbsenceHistoryPanel from '../components/AbsenceHistoryPanel'

export default function TeamAdminPage() {
  const { team, loading, reload } = useTeam()
  const { contracts, reload: reloadContracts } = useContracts()
  const { absences, reload: reloadAbsences } = useAbsences()
  const { requests: overtimeRequests, reload: reloadOvertime } = useOvertimeRequests()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [contractError, setContractError] = useState<string | null>(null)
  const [newContractType, setNewContractType] = useState<ContractType>('CDI')

  const previousYear = new Date().getFullYear() - 1
  const previousYearRange = useMemo(
    () => ({
      from: format(new Date(previousYear, 0, 1), 'yyyy-MM-dd'),
      to: format(new Date(previousYear, 11, 31), 'yyyy-MM-dd'),
    }),
    [previousYear]
  )
  const { shifts: previousYearShifts } = useShiftsRange(previousYearRange.from, previousYearRange.to)

  const selected = team.find((t) => t.id === selectedId) ?? null
  const selectedContracts = contracts
    .filter((c) => c.employee_id === selectedId)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))

  async function updateProfile(field: string, value: string | boolean) {
    if (!selectedId) return
    setProfileError(null)
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', selectedId)
    if (error) {
      setProfileError(error.message)
      return
    }
    reload()
  }

  async function addContract(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedId) return
    setContractError(null)
    const form = new FormData(e.currentTarget)
    const weekly_hours = Number(form.get('weekly_hours'))
    const effective_from = String(form.get('effective_from'))
    const contract_type = String(form.get('contract_type') || 'CDI') as ContractType
    const effective_to_raw = String(form.get('effective_to') || '')
    const label = String(form.get('label') || 'Contrat')
    if (!weekly_hours || !effective_from) return
    if (contract_type !== 'CDI' && !effective_to_raw) {
      setContractError('Une date de fin est obligatoire pour un CDD, une alternance ou un stage.')
      return
    }
    const { error } = await supabase.from('contracts').insert({
      employee_id: selectedId,
      weekly_hours,
      effective_from,
      effective_to: contract_type === 'CDI' ? null : effective_to_raw,
      contract_type,
      label,
    })
    if (error) {
      setContractError(error.message)
      return
    }
    ;(e.target as HTMLFormElement).reset()
    setNewContractType('CDI')
    reloadContracts()
  }

  async function deleteContract(id: string, label: string) {
    if (!window.confirm(`Supprimer le contrat "${label}" ? Cette action est définitive.`)) return
    setContractError(null)
    const { error } = await supabase.from('contracts').delete().eq('id', id)
    if (error) {
      setContractError(error.message)
      return
    }
    reloadContracts()
  }

  return (
    <div className="space-y-4">
      <OvertimePendingPanel team={team} requests={overtimeRequests} onChanged={reloadOvertime} />

      <AbsencePendingPanel team={team} requests={absences} onChanged={reloadAbsences} />

      <OvertimeYearlySummary team={team} requests={overtimeRequests} />

      <OvertimeHistoryPanel team={team} requests={overtimeRequests} onChanged={reloadOvertime} />

      <AbsenceHistoryPanel team={team} requests={absences} onChanged={reloadAbsences} />

      <PreviousYearBalance
        team={team}
        year={previousYear}
        shifts={previousYearShifts}
        contracts={contracts}
        absences={absences}
        overtimeRequests={overtimeRequests}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-2xl border border-sand-200 bg-white p-2">
        <p className="px-2 py-2 text-xs font-medium text-brand-700/60">Équipe</p>
        {loading && <p className="px-2 py-2 text-sm text-brand-700/50">Chargement…</p>}
        <div className="space-y-1">
          {team.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === t.id ? 'bg-brand-600 text-white' : 'hover:bg-sand-100 text-brand-900'
              }`}
            >
              <span>
                {t.full_name}
                {t.is_owner ? ' 👑' : ''}
              </span>
              <span
                className={`text-xs ${selectedId === t.id ? 'text-white/70' : 'text-brand-700/50'}`}
              >
                {t.group_name === 'asv' ? 'ASV' : 'Véto'}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-sand-50 px-3 py-2 text-xs text-brand-700/60">
          Pour créer un nouveau compte : Dashboard Supabase → Authentication → Add user (email +
          mot de passe). Le profil apparaît ensuite ici automatiquement, à compléter.
        </div>
      </div>

      <div className="space-y-4">
        {!selected && (
          <div className="rounded-2xl border border-sand-200 bg-white p-6 text-sm text-brand-700/60">
            Sélectionne une personne dans la liste pour voir et modifier son profil et son
            contrat.
          </div>
        )}

        {selected && (
          <>
            <div className="rounded-2xl border border-sand-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-brand-900">Profil</h2>
              <ErrorBanner message={profileError} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">Nom</label>
                  <input
                    key={selected.id}
                    defaultValue={selected.full_name}
                    onBlur={(e) => updateProfile('full_name', e.target.value)}
                    className="w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">Groupe</label>
                  <select
                    value={selected.group_name}
                    onChange={(e) => updateProfile('group_name', e.target.value as Group)}
                    className="w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400"
                  >
                    <option value="asv">ASV</option>
                    <option value="veterinaire">Vétérinaire</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-brand-900">
                  <input
                    type="checkbox"
                    checked={selected.is_owner}
                    onChange={(e) => updateProfile('is_owner', e.target.checked)}
                  />
                  Propriétaire (accès total)
                </label>
                <label className="flex items-center gap-2 text-sm text-brand-900">
                  <input
                    type="checkbox"
                    checked={selected.active}
                    onChange={(e) => updateProfile('active', e.target.checked)}
                  />
                  Compte actif
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-sand-200 bg-white p-5">
              <h2 className="mb-1 text-sm font-semibold text-brand-900">Contrat</h2>
              <p className="mb-4 text-xs text-brand-700/60">
                Le nombre d&apos;heures théoriques hebdomadaires sert au calcul automatique du
                solde d&apos;heures. Ajoute une nouvelle ligne pour un changement de contrat en
                cours d&apos;année.
              </p>

              <ErrorBanner message={contractError} />

              <form onSubmit={addContract} className="mb-4 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">Libellé</label>
                  <input
                    name="label"
                    placeholder="Temps plein"
                    className="w-32 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">Type</label>
                  <select
                    name="contract_type"
                    value={newContractType}
                    onChange={(e) => setNewContractType(e.target.value as ContractType)}
                    className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                  >
                    {CONTRACT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">
                    Heures / semaine
                  </label>
                  <input
                    name="weekly_hours"
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    className="w-28 rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">
                    Date de début
                  </label>
                  <input
                    name="effective_from"
                    type="date"
                    required
                    className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-900">
                    Date de fin
                  </label>
                  <input
                    name="effective_to"
                    type="date"
                    required={newContractType !== 'CDI'}
                    disabled={newContractType === 'CDI'}
                    className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-1.5 text-sm outline-none focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Ajouter
                </button>
              </form>

              <div className="divide-y divide-sand-100">
                {selectedContracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium text-brand-900">
                        {c.label} <span className="text-xs font-normal text-brand-700/50">· {c.contract_type}</span>
                      </p>
                      <p className="text-xs text-brand-700/60">
                        {formatHours(c.weekly_hours)} / semaine · du{' '}
                        {new Date(c.effective_from).toLocaleDateString('fr-FR')}
                        {c.effective_to
                          ? ` au ${new Date(c.effective_to).toLocaleDateString('fr-FR')}`
                          : ' (sans fin)'}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteContract(c.id, c.label)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                {selectedContracts.length === 0 && (
                  <p className="py-3 text-sm text-brand-700/60">Aucun contrat renseigné.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
