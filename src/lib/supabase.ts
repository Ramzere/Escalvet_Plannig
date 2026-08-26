import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Configuration Supabase manquante. Copie .env.example vers .env et renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
