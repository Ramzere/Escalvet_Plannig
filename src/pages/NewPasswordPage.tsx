import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { frenchError } from '../lib/errors'

/**
 * Page atteinte depuis le lien reçu par email après « Mot de passe oublié ».
 * Supabase a déjà ouvert une session de récupération : il ne reste qu'à
 * choisir le nouveau mot de passe.
 */
export default function NewPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setError(frenchError(error.message, 'Enregistrement impossible'))
      return
    }
    setDone(true)
    setTimeout(() => navigate('/planning', { replace: true }), 1500)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-sand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/logoEscalVet.jpeg"
            alt="Escal'Vet"
            className="mx-auto mb-3 h-20 w-20 rounded-2xl object-cover shadow-sm"
          />
          <h1 className="text-xl font-semibold text-brand-900">Nouveau mot de passe</h1>
          <p className="mt-1 text-sm text-brand-700/70">Choisis ton nouveau mot de passe.</p>
        </div>

        {done ? (
          <p className="rounded-2xl border border-sand-200 bg-white p-6 text-center text-sm text-brand-900">
            Mot de passe enregistré ✔ Redirection vers le planning…
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-sand-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-900" htmlFor="password">
                  Nouveau mot de passe
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-900" htmlFor="confirm">
                  Confirme-le
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
