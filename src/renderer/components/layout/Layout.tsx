import type { Route } from '../../App'
import { useAuth } from '../../store/auth'

const NAV_ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: '/',           label: 'Сводка',         icon: '▦' },
  { route: '/income',     label: 'Поступления',     icon: '₽' },
  { route: '/trucks',     label: 'Самосвалы',       icon: '🚛' },
  { route: '/employees',  label: 'Сотрудники',      icon: '👤' },
  { route: '/warehouse',  label: 'Склад',           icon: '📦' },
  { route: '/expenses',   label: 'Расходы',         icon: '📋' },
  { route: '/report',     label: 'Отчёт',           icon: '📊' },
]

const BOTTOM_ITEMS: { route: Route; label: string; icon: string }[] = [
  { route: '/audit',    label: 'История',   icon: '🕐' },
  { route: '/settings', label: 'Настройки', icon: '⚙' },
]

interface Props {
  route: Route
  navigate: (r: Route) => void
  children: React.ReactNode
}

export default function Layout({ route, navigate, children }: Props) {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50" style={{ paddingTop: '28px' }}>
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-primary-800 flex flex-col select-none">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-primary-700">
          <div className="text-white font-bold text-sm leading-tight">🚛 Truck Manager</div>
          <div className="text-primary-300 text-xs mt-0.5">Управление парком</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <NavItem
              key={item.route}
              {...item}
              active={route === item.route}
              onClick={() => navigate(item.route)}
            />
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="px-2 py-2 border-t border-primary-700">
          {BOTTOM_ITEMS.map(item => (
            <NavItem
              key={item.route}
              {...item}
              active={route === item.route}
              onClick={() => navigate(item.route)}
            />
          ))}

          {/* User info + logout */}
          <div className="mt-2 px-3 py-2 rounded-lg">
            <div className="text-primary-300 text-xs truncate">{user?.display_name}</div>
            <button
              onClick={logout}
              className="text-primary-400 text-xs hover:text-white transition-colors mt-0.5"
            >
              Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function NavItem({ label, icon, active, onClick }: {
  label: string; icon: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-100 mb-0.5
        ${active
          ? 'bg-white/15 text-white font-medium'
          : 'text-primary-200 hover:bg-white/10 hover:text-white'}
      `}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
