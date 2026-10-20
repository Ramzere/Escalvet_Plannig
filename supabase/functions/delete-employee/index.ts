// Edge Function : suppression définitive d'un·e employé·e.
//
// Seul un compte propriétaire actif peut l'appeler, et jamais sur lui-même.
// Elle supprime l'utilisateur dans auth.users ; le profil puis tout
// l'historique (créneaux, contrats, absences, heures sup) sont supprimés en
// cascade par les clés étrangères du schéma.
//
// Déploiement (une fois, depuis la racine du projet, avec la CLI Supabase) :
//   supabase functions deploy delete-employee --project-ref <ref-du-projet>
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournies
// automatiquement à la fonction, rien à configurer.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Non authentifié.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Client "en tant qu'appelant" : identifie qui demande la suppression.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
    error: userError,
  } = await asCaller.auth.getUser()
  if (userError || !caller) return json({ error: 'Non authentifié.' }, 401)

  // Client administrateur : lit les profils sans RLS et supprime le compte.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_owner, active')
    .eq('id', caller.id)
    .single()
  if (!callerProfile?.is_owner || !callerProfile.active) {
    return json({ error: 'Seul un compte propriétaire peut supprimer un employé.' }, 403)
  }

  let employeeId: string | undefined
  try {
    const body = await req.json()
    employeeId = typeof body?.employee_id === 'string' ? body.employee_id : undefined
  } catch {
    // corps vide ou invalide : géré juste en dessous
  }
  if (!employeeId) return json({ error: 'employee_id manquant.' }, 400)
  if (employeeId === caller.id) {
    return json({ error: 'Tu ne peux pas supprimer ton propre compte.' }, 400)
  }

  const { data: target } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('id', employeeId)
    .maybeSingle()
  if (!target) return json({ error: 'Employé introuvable.' }, 404)

  const { error: deleteError } = await admin.auth.admin.deleteUser(employeeId)
  if (deleteError) return json({ error: deleteError.message }, 500)

  return json({ ok: true, deleted: target.full_name })
})
