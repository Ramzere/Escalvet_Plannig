#!/usr/bin/env node
// Complète le poste des créneaux ASV qui n'en ont pas, avec la règle
// habituelle du cabinet : sur une demi-journée, la personne qui commence le
// plus tôt est au chenil/chirurgie (bleu), la suivante à l'accueil (violet),
// et une personne seule fait tous les postes (seul).
//
//   OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/backfill-postes.mjs [--dry-run]

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const dryRun = process.argv.includes('--dry-run')
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey, OWNER_EMAIL: email, OWNER_PASSWORD: password } = process.env
if (!url || !anonKey || !email || !password) {
  console.error('Renseigne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env) et OWNER_EMAIL / OWNER_PASSWORD.')
  process.exit(1)
}
const sb = createClient(url, anonKey, { auth: { persistSession: false } })
const { error: authError } = await sb.auth.signInWithPassword({ email, password })
if (authError) { console.error('Connexion impossible :', authError.message); process.exit(1) }

const { data: profiles } = await sb.from('profiles').select('id, full_name, group_name')
const asv = new Set(profiles.filter((p) => p.group_name === 'asv').map((p) => p.id))
const { data: shifts } = await sb.from('shifts').select('id, employee_id, work_date, period, start_time, poste')
const asvShifts = shifts.filter((s) => asv.has(s.employee_id))

const updates = []
const byHalfDay = new Map()
for (const s of asvShifts) {
  const k = `${s.work_date}|${s.period}`
  if (!byHalfDay.has(k)) byHalfDay.set(k, [])
  byHalfDay.get(k).push(s)
}
for (const group of byHalfDay.values()) {
  const sorted = [...group].sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
  sorted.forEach((s, i) => {
    if (s.poste) return
    const poste = sorted.length === 1 ? 'seul' : i === 0 ? 'bleu' : 'violet'
    updates.push({ id: s.id, poste, label: `${profiles.find((p) => p.id === s.employee_id)?.full_name} ${s.work_date} ${s.period} → ${poste}` })
  })
}
console.log(`${updates.length} créneau(x) à compléter${dryRun ? ' (simulation)' : ''}.`)
const tally = updates.reduce((m, u) => ((m[u.poste] = (m[u.poste] ?? 0) + 1), m), {})
console.log(tally)
if (!dryRun) {
  for (const poste of Object.keys(tally)) {
    const ids = updates.filter((u) => u.poste === poste).map((u) => u.id)
    const { error } = await sb.from('shifts').update({ poste }).in('id', ids)
    if (error) { console.error('Erreur :', error.message); process.exit(1) }
  }
  console.log('Terminé ✔')
}
await sb.auth.signOut()
