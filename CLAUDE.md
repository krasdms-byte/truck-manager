# TruckManager — CLAUDE.md

## Стек
Electron 29 · React 18 · TypeScript · SQLite (better-sqlite3) · Tailwind CSS · Zustand · React Router v6 · Recharts · Mac-only

## Пути
| | |
|---|---|
| Проект (исходники + запуск) | `~/Documents/TruckManager/` |
| БД | `~/Documents/TruckManager/trucks.db` |
| Настройки приложения | `~/Library/Application Support/truck-manager/settings.json` |

## Деплой и запуск
- **Только frontend** (`src/renderer/`): Vite подхватывает сам, перезапуск не нужен
- **Backend** (`src/main/`): нужен rebuild:
```
cd ~/Documents/TruckManager && npm run build:main && npm run start
```

## Архитектура

### Backend — `src/main/`
| Файл | Назначение |
|------|------------|
| `main.ts` | Точка входа Electron, регистрирует все IPC handlers |
| `preload.ts` | Мост renderer↔main, экспортирует `window.api` |
| `database/db.ts` | SQLite init, вся схема, миграции через `try { ALTER TABLE } catch {}` |
| `ipc/auth.ts` | login / logout / verify |
| `ipc/trips.ts` | Рейсы: CRUD + фильтры (project_id, truck_id, driver_id, from/to) |
| `ipc/expenses.ts` | Расходы: CRUD + фильтры (pay_status, organization_id, project_id) |
| `ipc/projects.ts` | Проекты + getRateGrid / saveRateGrid / getRateForDistance |
| `ipc/employees.ts` | Сотрудники: CRUD, смены, зарплата |
| `ipc/income.ts` | Поступления: CRUD |
| `ipc/reports.ts` | Сводные отчёты: getSummary, getByTruck, getByDriver, getMonthly, getDebts |
| `ipc/accommodation.ts` | Проживание/питание: настройки, водители, расчёт долгов |
| `ipc/organizations.ts` | Организации: CRUD, долги, поиск по ИНН |
| `ipc/dictionaries.ts` | Справочники: категории, единицы, наименования |
| `ipc/backup.ts` | Создание / список / восстановление бэкапов |
| `ipc/audit.ts` | История изменений (getLog, getTables) |

### Frontend — `src/renderer/`
| Файл | Назначение |
|------|------------|
| `App.tsx` | HashRouter, маршруты, RequireAuth, автологин через verify() |
| `electron.d.ts` | Типы `window.api` — **единственное место**, обновлять при добавлении методов |
| `types/index.ts` | Все TypeScript интерфейсы: Trip, Expense, Employee, Project... |
| `utils/format.ts` | formatMoney, formatDate, monthStartISO, monthEndISO (локальная дата!) |
| `store/authStore.ts` | Zustand: user, token (sessionStorage), login/logout/verify |
| `styles/global.css` | `.select-text` разрешает выделение текста |

#### Компоненты
| Файл | Назначение |
|------|------------|
| `components/layout/AppLayout.tsx` | Боковое меню, навигация |
| `components/OrgSelector.tsx` | Универсальный селектор организаций с модалкой создания |
| `components/AccommodationSection.tsx` | Секция проживания/питания в карточке проекта |
| `components/PdfImportDialog.tsx` | Импорт запчастей из PDF через Claude API |

#### Страницы
| Файл | Назначение |
|------|------------|
| `LoginPage.tsx` | Автологин (нет формы), сразу редирект на `/` |
| `DashboardPage.tsx` | Сводка: KPI, график по месяцам, таблица по технике |
| `ProjectsPage.tsx` | Проекты/Клиенты + редактор сетки тарифов |
| `ProjectDetailPage.tsx` | Детали проекта: рейсы, расходы, проживание, экспорт PDF/Excel |
| `TrucksPage.tsx` | Техника |
| `TripsPage.tsx` | Рейсы: фильтры, пагинация, Excel/PDF экспорт |
| `AddTripPage.tsx` | Добавить рейс: автоподстановка ставки из сетки тарифов |
| `TripAddPage.tsx` | Дублирует AddTripPage (устаревший, проверить) |
| `ExpensesPage.tsx` | Расходы: фильтры (категория, статус оплаты, проект, орг) |
| `AddExpensePage.tsx` | Добавить расход: несколько позиций, со склада или вручную |
| `ExpenseAddPage.tsx` | Старая версия AddExpensePage (проверить, нужна ли) |
| `EmployeesPage.tsx` | Список сотрудников |
| `EmployeePage.tsx` / `EmployeeDetailPage.tsx` | Карточка сотрудника, смены, зарплата |
| `IncomePage.tsx` | Поступления |
| `WarehousePage.tsx` | Склад: остатки + движение, импорт счёта |
| `ReportPage.tsx` | Отчёт: KPI, графики, долги, сводка по проектам |
| `DictionariesPage.tsx` | Справочники (категории, единицы, наименования) |
| `SettingsPage.tsx` | Бэкап/восстановление, Claude API ключ |
| `AuditPage.tsx` | История изменений |

## БД — таблицы
| Таблица | Ключевые поля |
|---------|---------------|
| `users` | id, username, password_hash, role |
| `trucks` | id, plate, model, vehicle_type, active |
| `employees` | id, full_name, role, truck_id, active, salary_type, salary_fixed, salary_gross, tax_rate |
| `projects` | id, name, client_name, status, default_pricing_mode, default_price_per_trip, default_price_per_ton_km |
| `project_rate_grid` | id, project_id, km_from, km_to, rate, sort_order |
| `trips` | id, date, truck_id, driver_id, project_id, shift_type, pricing_mode, trips_count, amount |
| `income` | id, date, amount, project_id, comment |
| `expenses` | id, date, truck_id, category, name, qty, price_per_unit, amount, organization_id, pay_status, project_id, part_id |
| `parts` | id, name, category, unit, qty_in_stock, price_per_unit, supplier |
| `parts_receipts` | id, part_id, qty, price_per_unit, date, supplier, comment |
| `payments` | id, employee_id, amount, month, date |
| `salary_overrides` | id, employee_id, month, amount |
| `organizations` | id, name, inn, type ('supplier'/'client'/'both') |
| `dict_categories` | id, name, type, sort_order |
| `dict_units` | id, name, sort_order |
| `dict_items` | id, name, category, unit, price_per_unit |
| `project_accommodation` | project_id, accommodation_cost, meal_cost, accommodation_org_id, meal_org_id, end_date |
| `project_worker_dates` | id, project_id, employee_id, start_date, end_date |
| `accommodation_debts` | id, project_id, period_month, type, amount, actual_amount, days_count, workers_count, closed_at |
| `audit_log` | id, table_name, record_id, action, old_data, new_data, changed_at |

## window.api — все методы
```
api.auth.{ login, logout, verify }
api.income.{ getAll(f), create, update, remove, getTotal }
api.trips.{ getAll(f), create, update, remove, getSummary }
api.employees.{ getAll(f), getById, create, update, getShifts, setShift, getPayments, addPayment, getSalary }
api.expenses.{ getAll(f), create, update, remove }
api.parts.{ getAll(f), create, update, remove, receipts.{getAll, create, remove} }
api.projects.{ getAll, getById, create, update, remove, getSummary, getRateGrid, saveRateGrid, getRateForDistance }
api.trucks.{ getAll, getAllWithStats, create, update }
api.reports.{ getSummary, getByTruck, getByDriver, getMonthly, getDebts, getProjectOrgSummary }
api.backup.{ create, list, restore }
api.dict.{ categories.{getAll,create,update,remove}, units.{...}, items.{getAll,create,update,remove} }
api.accommodation.{ getSettings, saveSettings, getWorkers, setWorker, removeWorker, calcDebts, getDebts, getAllDebts, closeDebt, closeMultiple, setActualAmount }
api.organizations.{ getAll, create, update, remove, getDebts, closeDebt, lookupInn }
api.audit.{ getLog(f), getTables }
api.claude.{ recognize(base64, mediaType) }
api.settings.{ get(key), set(key, value) }
```

## Правила работы с кодом
- Миграции БД: `try { db.exec('ALTER TABLE...') } catch {}` в `db.ts`
- `window.api` — типизированный, не использовать `(window as any).api`
- Типы `window.api` обновлять в `electron.d.ts`
- Даты — локальные (не UTC), использовать `monthStartISO` / `monthEndISO` из `format.ts`
- После правки frontend: деплой без перезапуска (Vite hot reload)
- После правки backend: деплой + `build:main` + перезапуск

## Известные особенности
- `TripAddPage.tsx` и `ExpenseAddPage.tsx` — возможно устаревшие дубли, проверить
- `parts.supplier` — текстовое поле, не FK на organizations
- Claude API вызывается через IPC (main process) — Electron блокирует fetch из renderer
- ИНН поиск через ФНС не работает (CORS)
- В `preload.ts` есть дублирование блока `accommodation` — не влияет на работу

## Задачи в работе
- Журнал выездов водителей с объекта
- Закрытие долга за расходы при поступлении оплаты
- Партии запчастей — выбор партии при списании
- Сборка .dmg
