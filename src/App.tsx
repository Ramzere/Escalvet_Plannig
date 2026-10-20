import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import PlanningPage from './pages/PlanningPage'

// Pages chargées à la demande : le planning (page d'accueil) reste léger,
// Équipe, Historique et la page de mot de passe ne sont téléchargées qu'à
// leur première ouverture.
const TeamAdminPage = lazy(() => import('./pages/TeamAdminPage'))
const NewPasswordPage = lazy(() => import('./pages/NewPasswordPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))

function PageLoading() {
  return <p className="py-10 text-center text-sm text-brand-700/50">Chargement…</p>
}

function Gate({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-brand-700/60">
        Chargement…
      </div>
    )
  }
  if (!session) return <LoginPage />
  if (!profile) {
    return (
      <div className="flex min-h-svh items-center justify-center px-4 text-center text-sm text-brand-700/60">
        Ton compte n&apos;a pas encore de profil configuré. Contacte la personne responsable du
        cabinet.
      </div>
    )
  }
  if (!profile.active) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-brand-900">
          Ce compte a été désactivé. Contacte la personne responsable du cabinet si tu penses
          qu&apos;il s&apos;agit d&apos;une erreur.
        </p>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-sand-50"
        >
          Se déconnecter
        </button>
      </div>
    )
  }
  return <>{children}</>
}

function OwnerOnly({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile?.is_owner) return <Navigate to="/planning" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate>
          <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/nouveau-mot-de-passe" element={<NewPasswordPage />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/planning" replace />} />
              <Route path="/planning" element={<PlanningPage />} />
              <Route
                path="/equipe"
                element={
                  <OwnerOnly>
                    <TeamAdminPage />
                  </OwnerOnly>
                }
              />
              <Route
                path="/historique"
                element={
                  <OwnerOnly>
                    <HistoryPage />
                  </OwnerOnly>
                }
              />
              <Route path="*" element={<Navigate to="/planning" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </Gate>
      </AuthProvider>
    </BrowserRouter>
  )
}
