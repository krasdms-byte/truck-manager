import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { AppLayout }          from './components/layout/AppLayout'
import { LoginPage }          from './pages/LoginPage'
import { DashboardPage }      from './pages/DashboardPage'
import { IncomePage }         from './pages/IncomePage'
import { TripsPage }          from './pages/TripsPage'
import { AddTripPage }        from './pages/AddTripPage'
import { EmployeesPage }      from './pages/EmployeesPage'
import { EmployeePage }       from './pages/EmployeePage'
import { WarehousePage }      from './pages/WarehousePage'
import { ExpensesPage }       from './pages/ExpensesPage'
import { AddExpensePage }     from './pages/AddExpensePage'
import { ReportPage }         from './pages/ReportPage'
import { SettingsPage }       from './pages/SettingsPage'
import { AuditPage }          from './pages/AuditPage'
import { DictionariesPage }    from './pages/DictionariesPage'
import { ProjectsPage }       from './pages/ProjectsPage'
import { ProjectDetailPage }  from './pages/ProjectDetailPage'
import { TrucksPage }         from './pages/TrucksPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  if (isLoading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-400 text-sm">Загрузка...</div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { verify } = useAuthStore()
  useEffect(() => { verify() }, [verify])

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index                    element={<DashboardPage />} />
          <Route path="projects"          element={<ProjectsPage />} />
          <Route path="projects/:id"      element={<ProjectDetailPage />} />
          <Route path="trucks"            element={<TrucksPage />} />
          <Route path="income"            element={<IncomePage />} />
          <Route path="trips"             element={<TripsPage />} />
          <Route path="trips/add"         element={<AddTripPage />} />
          <Route path="employees"         element={<EmployeesPage />} />
          <Route path="employees/:id"     element={<EmployeePage />} />
          <Route path="warehouse"         element={<WarehousePage />} />
          <Route path="expenses"          element={<ExpensesPage />} />
          <Route path="expenses/add"      element={<AddExpensePage />} />
          <Route path="report"            element={<ReportPage />} />
          <Route path="settings"          element={<SettingsPage />} />
          <Route path="audit"             element={<AuditPage />} />
          <Route path="dictionaries"       element={<DictionariesPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
