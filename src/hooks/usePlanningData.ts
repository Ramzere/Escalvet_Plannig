import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Absence, Contract, OvertimeRequest, Profile, Shift } from '../types'

/**
 * Recharge `onChange` dès qu'une ligne de `table` change côté Supabase
 * (insert/update/delete), pour que les autres personnes connectées voient
 * les changements sans avoir à recharger la page.
 */
function useTableChanges(table: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`${table}-changes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, onChange])
}

export function useTeam() {
  const [team, setTeam] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, group_name, is_owner, active')
      .order('full_name')
    if (!error) setTeam((data as Profile[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useTableChanges('profiles', reload)

  return { team, loading, reload }
}

export function useContracts() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contracts')
      .select('id, employee_id, label, contract_type, weekly_hours, effective_from, effective_to')
      .order('effective_from', { ascending: false })
    if (!error) setContracts((data as Contract[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useTableChanges('contracts', reload)

  return { contracts, loading, reload }
}

export function useAbsences() {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('absences')
      .select('id, employee_id, start_date, end_date, reason')
      .order('start_date', { ascending: false })
    if (!error) setAbsences((data as Absence[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useTableChanges('absences', reload)

  return { absences, loading, reload }
}

/**
 * Charge les déclarations d'heures sup. La RLS limite déjà les employés à
 * leurs propres déclarations ; le propriétaire voit celles de toute l'équipe.
 */
export function useOvertimeRequests() {
  const [requests, setRequests] = useState<OvertimeRequest[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('overtime_requests')
      .select(
        'id, employee_id, work_date, hours, minutes, note, status, admin_note, created_at'
      )
      .order('work_date', { ascending: false })
    if (!error) setRequests((data as OvertimeRequest[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useTableChanges('overtime_requests', reload)

  return { requests, loading, reload }
}

/** Charge les créneaux entre deux dates ISO (bornes incluses). */
export function useShiftsRange(fromIso: string, toIso: string) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('shifts')
      .select('id, employee_id, work_date, period, start_time, end_time, poste, note')
      .gte('work_date', fromIso)
      .lte('work_date', toIso)
      .order('work_date')
      .order('start_time')
    if (!error) setShifts((data as Shift[]) ?? [])
    setLoading(false)
  }, [fromIso, toIso])

  useEffect(() => {
    reload()
  }, [reload])
  useTableChanges('shifts', reload)

  return { shifts, loading, reload }
}
