#!/usr/bin/env node
// Importe un planning (créneaux + absences) depuis un fichier JSON dans
// Supabase, en se connectant avec un compte propriétaire (la RLS exige
// is_owner pour écrire des créneaux).
//
//   OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/import-planning.mjs data/planning-2026-10.json
//
// Options :
//   --dry-run   affiche ce qui serait fait sans rien écrire
//   --replace   supprime d'abord les créneaux existants des personnes
//               concernées sur la période du fichier (sinon, un créneau déjà
//               présent pour la même personne / date / demi-journée est ignoré)
//
// VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont lues dans .env.

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadDotEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadDotEnv()

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const replace = args.includes('--replace')
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('Usage : node scripts/import-planning.mjs <fichier.json> [--dry-run] [--replace]')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.OWNER_EMAIL
const password = process.env.OWNER_PASSWORD
if (!url || !anonKey) fail('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes (.env).')
if (!email || !password) fail('Renseigne OWNER_EMAIL et OWNER_PASSWORD (compte propriétaire).')

const plan = JSON.parse(readFileSync(file, 'utf8'))
const shifts = plan.shifts ?? []
const absences = plan.absences ?? []
const dates = shifts.map((s) => s.date).concat(absences.flatMap((a) => [a.start_date, a.end_date]))
const from = dates.reduce((a, b) => (a < b ? a : b))
const to = dates.reduce((a, b) => (a > b ? a : b))

const supabase = createClient(url, anonKey, { auth: { persistSession: false } })
const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
if (authError) fail(`Connexion impossible : ${authError.message}`)

const { data: me } = await supabase.from('profiles').select('id, is_owner').single()
if (!me?.is_owner) fail("Ce compte n'est pas propriétaire : la RLS refusera l'écriture.")

// ---- Résolution des prénoms → profils ---------------------------------------
const { data: team, error: teamError } = await supabase
  .from('profiles')
  .select('id, full_name, active')
if (teamError) fail(teamError.message)

const norm = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const names = [...new Set(shifts.concat(absences).map((x) => x.employee))]
const idOf = {}
for (const name of names) {
  const matches = team.filter((t) => norm(t.full_name).split(/\s+/)[0] === norm(name) || norm(t.full_name) === norm(name))
  if (matches.length === 1) idOf[name] = matches[0].id
  else if (matches.length === 0) fail(`Aucun profil pour « ${name} ». Profils : ${team.map((t) => t.full_name).join(', ')}`)
  else fail(`Plusieurs profils pour « ${name} » : ${matches.map((t) => t.full_name).join(', ')}. Mets le nom complet dans le JSON.`)
}
console.log('Personnes :', names.map((n) => `${n} → ${team.find((t) => t.id === idOf[n]).full_name}`).join(' · '))
console.log(`Période : ${from} → ${to}${dryRun ? '  (simulation, rien ne sera écrit)' : ''}`)

const employeeIds = [...new Set(Object.values(idOf))]

// ---- Créneaux ---------------------------------------------------------------
if (replace) {
  console.log(`Suppression des créneaux existants de ces personnes entre ${from} et ${to}…`)
  if (!dryRun) {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .in('employee_id', employeeIds)
      .gte('work_date', from)
      .lte('work_date', to)
    if (error) fail(error.message)
  }
}

const { data: existing, error: existingError } = await supabase
  .from('shifts')
  .select('employee_id, work_date, period')
  .in('employee_id', employeeIds)
  .gte('work_date', from)
  .lte('work_date', to)
if (existingError) fail(existingError.message)
const existingKeys = new Set((replace && !dryRun ? [] : existing).map((s) => `${s.employee_id}|${s.work_date}|${s.period}`))

const toInsert = []
let skipped = 0
for (const s of shifts) {
  const employee_id = idOf[s.employee]
  const key = `${employee_id}|${s.date}|${s.period}`
  if (existingKeys.has(key) && !replace) {
    skipped++
    continue
  }
  toInsert.push({
    employee_id,
    work_date: s.date,
    period: s.period,
    start_time: s.start,
    end_time: s.end,
    poste: s.poste ?? null,
    note: s.note ?? null,
    created_by: me.id,
  })
}
console.log(`Créneaux : ${toInsert.length} à insérer, ${skipped} déjà présents (ignorés).`)
if (!dryRun && toInsert.length) {
  const { error } = await supabase.from('shifts').insert(toInsert)
  if (error) fail(error.message)
}

// ---- Absences (déjà validées) -----------------------------------------------
const { data: existingAbs } = await supabase
  .from('absences')
  .select('employee_id, start_date, end_date')
  .in('employee_id', employeeIds)
  .lte('start_date', to)
  .gte('end_date', from)
const absKeys = new Set((existingAbs ?? []).map((a) => `${a.employee_id}|${a.start_date}|${a.end_date}`))
const absToInsert = absences
  .filter((a) => !absKeys.has(`${idOf[a.employee]}|${a.start_date}|${a.end_date}`))
  .map((a) => ({
    employee_id: idOf[a.employee],
    start_date: a.start_date,
    end_date: a.end_date,
    reason: a.reason ?? 'Congés',
    status: 'approved',
    decided_by: me.id,
    decided_at: new Date().toISOString(),
  }))
console.log(`Absences : ${absToInsert.length} à insérer, ${absences.length - absToInsert.length} déjà présentes (ignorées).`)
if (!dryRun && absToInsert.length) {
  const { error } = await supabase.from('absences').insert(absToInsert)
  if (error) fail(error.message)
}

console.log(dryRun ? 'Simulation terminée.' : 'Import terminé ✔')
await supabase.auth.signOut()

function fail(msg) {
  console.error('Erreur :', msg)
  process.exit(1)
}
