import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Contract, Profile, Shift, WeeklyAbsence } from '../types'

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

  return { team, loading, reload }
}

export function useContracts() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('contracts')
      .select('id, employee_id, label, weekly_hours, effective_from')
      .order('effective_from', { ascending: false })
    if (!error) setContracts((data as Contract[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { contracts, loading, reload }
}

export function useAbsences() {
  const [absences, setAbsences] = useState<WeeklyAbsence[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('weekly_absences')
      .select('id, employee_id, week_start, reason')
    if (!error) setAbsences((data as WeeklyAbsence[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { absences, loading, reload }
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

  return { shifts, loading, reload }
}
