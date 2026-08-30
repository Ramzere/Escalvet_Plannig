import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { profile, signOut } = useAuth()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-brand-600 text-white' : 'text-brand-800 hover:bg-brand-100'
    }`

  return (
    <div className="min-h-svh bg-sand-50">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-semibold text-white">
              E
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-brand-900">
                Escal&apos;vet
              </p>
              <p className="text-xs leading-tight text-brand-700/60">
                {profile?.full_name}
                {profile?.is_owner ? ' · propriétaire' : ''}
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink to="/planning" className={linkClass}>
              Planning
            </NavLink>
            <NavLink to="/historique" className={linkClass}>
              Historique
            </NavLink>
            {profile?.is_owner && (
              <NavLink to="/equipe" className={linkClass}>
                Équipe
              </NavLink>
            )}
          </nav>

          <button
            onClick={() => signOut()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700/70 transition hover:bg-sand-100 hover:text-brand-900"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
