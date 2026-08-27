export type Group = 'asv' | 'veterinaire'
export type Poste = 'bleu' | 'violet' | 'vert' | 'seul'
export type Period = 'matin' | 'apres-midi'

export interface Profile {
  id: string
  full_name: string
  group_name: Group
  is_owner: boolean
  active: boolean
}

export interface Contract {
  id: string
  employee_id: string
  label: string
  weekly_hours: number
  effective_from: string // ISO date (yyyy-mm-dd)
}

export interface Shift {
  id: string
  employee_id: string
  work_date: string // ISO date (yyyy-mm-dd)
  period: Period
  start_time: string // HH:MM or HH:MM:SS
  end_time: string
  poste: Poste
  note?: string | null
}

export interface WeeklyAbsence {
  id: string
  employee_id: string
  week_start: string // ISO date (Monday)
  reason: string
}

export type OvertimeStatus = 'pending' | 'approved' | 'rejected'

export interface OvertimeRequest {
  id: string
  employee_id: string
  work_date: string // ISO date (yyyy-mm-dd)
  hours: number
  minutes: number
  note?: string | null
  status: OvertimeStatus
  admin_note?: string | null
  created_at: string
}

export const POSTE_LABELS: Record<Poste, string> = {
  bleu: 'Chenil / chirurgie / examens complémentaires / nettoyage chirurgie',
  violet: 'Accueil / rangement / nettoyage et stock des salles (hors chirurgie)',
  vert: 'Volante : aide aux vétérinaires, propreté et nettoyage de tout l’arrière / chenil du soir',
  seul: 'Seul(e) : tous les postes',
}

export const POSTE_SHORT_LABELS: Record<Poste, string> = {
  bleu: 'Bleu',
  violet: 'Violet',
  vert: 'Vert',
  seul: 'Seul(e)',
}
