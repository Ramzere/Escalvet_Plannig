export type Group = 'asv' | 'veterinaire'
export type Poste = 'bleu' | 'violet' | 'vert' | 'seul'
export type Period = 'matin' | 'apres-midi'
export type ContractType = 'CDI' | 'CDD' | 'Alternance' | 'Stage'

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
  contract_type: ContractType
  weekly_hours: number
  effective_from: string // ISO date (yyyy-mm-dd)
  effective_to: string | null // ISO date, toujours null pour un CDI
}

export interface Shift {
  id: string
  employee_id: string
  work_date: string // ISO date (yyyy-mm-dd)
  period: Period
  start_time: string // HH:MM or HH:MM:SS
  end_time: string
  poste: Poste | null // null pour les vétérinaires (pas de notion de poste)
  note?: string | null
}

export type AbsenceStatus = 'pending' | 'approved' | 'rejected'

export interface Absence {
  id: string
  employee_id: string
  start_date: string // ISO date
  end_date: string // ISO date, incluse
  reason: string
  status: AbsenceStatus
}

export const CONTRACT_TYPES: ContractType[] = ['CDI', 'CDD', 'Alternance', 'Stage']

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
  violet: 'Accueil / rangement / nettoyage et stock des salles sauf chirurgie',
  vert: 'Volante : aide aux vétérinaires (radios, analyses, nettoyage salle), propreté et nettoyage de TOUT l’arrière / chenil du soir',
  seul: 'Tous les postes',
}

export const POSTE_SHORT_LABELS: Record<Poste, string> = {
  bleu: 'Chenil / Chirurgie',
  violet: 'Accueil',
  vert: 'Volante',
  seul: 'Tous les postes',
}
