import type { ReactNode } from 'react'
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import PlanningPage from './pages/PlanningPage'
import TeamAdminPage from './pages/TeamAdminPage'
import HistoryPage from './pages/HistoryPage'

function Gate({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()

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
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/planning" replace />} />
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/historique" element={<HistoryPage />} />
              <Route
                path="/equipe"
                element={
                  <OwnerOnly>
                    <TeamAdminPage />
                  </OwnerOnly>
                }
              />
              <Route path="*" element={<Navigate to="/planning" replace />} />
            </Route>
          </Routes>
        </Gate>
      </AuthProvider>
    </BrowserRouter>
  )
}
