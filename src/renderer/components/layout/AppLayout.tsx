import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV = [
  { to: '/',          icon: '📊', label: 'Сводка' },
  { to: '/projects',  icon: '📋', label: 'Проекты' },
  { to: '/trucks',    icon: '🚛', label: 'Техника' },
  { to: '/income',    icon: '💰', label: 'Поступления' },
  { to: '/trips',     icon: '🗺️',  label: 'Рейсы' },
  { to: '/employees', icon: '👷', label: 'Сотрудники' },
  { to: '/warehouse', icon: '🏭', label: 'Склад' },
  { to: '/expenses',  icon: '🔧', label: 'Расходы' },
  { to: '/report',    icon: '📈', label: 'Отчёт' },
  { to: '/dictionaries', icon: '📚', label: 'Справочники' },
]

const NAV_BOTTOM = [
  { to: '/audit',    icon: '🕓', label: 'История' },
  { to: '/settings', icon: '⚙️', label: 'Настройки' },
]

export function AppLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-56 flex-shrink-0 bg-primary-800 flex flex-col select-none">
        <div className="h-12 flex items-center px-5 pt-1">
          <span className="text-white font-bold text-sm tracking-wide">🚛 Truck Manager</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
              }>
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-2 border-t border-white/10 space-y-0.5">
          {NAV_BOTTOM.map(({ to, icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
              }>
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.display_name?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">{user?.display_name}</div>
              <div className="text-white/50 text-xs">{user?.role === 'admin' ? 'Администратор' : 'Оператор'}</div>
            </div>
            <button onClick={() => { logout(); navigate('/login') }}
              className="text-white/50 hover:text-white text-xs transition-colors" title="Выйти">↩</button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="h-3 bg-slate-50 sticky top-0 z-10" style={{ WebkitAppRegion: 'drag' } as any} />
        <div className="p-6"><Outlet /></div>
      </main>
    </div>
  )
}
