import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(
        error.message.includes('Invalid login credentials')
          ? 'Identifiants incorrects.'
          : error.message
      )
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-sand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-semibold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-brand-900">Escal&apos;vet</h1>
          <p className="mt-1 text-sm text-brand-700/70">Planning de l&apos;équipe</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-sand-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-900" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                placeholder="prenom@cabinet.fr"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-900" htmlFor="password">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-brand-700/60">
          Pas de compte ? Demande à la personne responsable du cabinet de t&apos;en créer un.
        </p>
      </div>
    </div>
  )
}
