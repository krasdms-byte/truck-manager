// Заглушки страниц — будут реализованы в этапах 3–9
import type { Route } from '../App'

interface Props {
  navigate: (r: Route, p?: Record<string, string>) => void
  params?: Record<string, string>
}

function StubPage({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">{icon}</span>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      </div>
      <div className="card">
        <div className="card-body text-center py-16">
          <div className="text-4xl mb-3">{icon}</div>
          <p className="text-slate-500">Модуль «{title}» будет реализован на следующем этапе.</p>
        </div>
      </div>
    </div>
  )
}

export function IncomePage(_: Props) { return <StubPage title="Поступления" icon="₽" /> }
export function TrucksPage(_: Props) { return <StubPage title="Работа самосвалов" icon="🚛" /> }
export function TripAddPage(_: Props) { return <StubPage title="Добавить рейс" icon="➕" /> }
export function EmployeesPage(_: Props) { return <StubPage title="Сотрудники" icon="👤" /> }
export function EmployeeDetailPage(_: Props) { return <StubPage title="Карточка сотрудника" icon="👤" /> }
export function WarehousePage(_: Props) { return <StubPage title="Склад запчастей" icon="📦" /> }
export function ExpensesPage(_: Props) { return <StubPage title="Расходы" icon="📋" /> }
export function ExpenseAddPage(_: Props) { return <StubPage title="Добавить расход" icon="➕" /> }
export function ReportPage(_: Props) { return <StubPage title="Сводный отчёт" icon="📊" /> }
export function AuditPage(_: Props) { return <StubPage title="История изменений" icon="🕐" /> }
export function SettingsPage(_: Props) { return <StubPage title="Настройки" icon="⚙" /> }
