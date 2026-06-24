// ─── БАЗОВЫЕ ТИПЫ ─────────────────────────────────────────────────────────────

export interface BaseRecord {
  id: number
  created_at: string
  updated_at: string
}

// ─── СПРАВОЧНИКИ ──────────────────────────────────────────────────────────────

export interface Truck extends BaseRecord {
  plate: string
  model?: string
  year?: number
  active: 0 | 1
}

export interface Employee extends BaseRecord {
  full_name: string
  role: 'driver' | 'mechanic'
  truck_id?: number
  truck_plate?: string
  salary_type: 'formula' | 'fixed'
  salary_gross: number
  salary_fixed?: number
  tax_rate: number
  active: 0 | 1
}

// ─── ФИНАНСЫ ──────────────────────────────────────────────────────────────────

export interface Income extends BaseRecord {
  date: string
  from_who: string
  account_number?: string
  period_from?: string
  period_to?: string
  amount: number
  comment?: string
  deleted_at?: string
}

export interface Trip extends BaseRecord {
  date: string
  truck_id: number
  truck_plate?: string
  driver_id: number
  driver_name?: string
  shift_type: 'day' | 'night'
  pricing_mode: 'per_trip' | 'per_ton_km'
  trips_count: number
  price_per_trip?: number
  tons?: number
  distance_km?: number
  price_per_ton_km?: number
  amount: number
  comment?: string
  deleted_at?: string
}

export interface Shift extends BaseRecord {
  date: string
  employee_id: number
  full_name?: string
  truck_id?: number
  truck_plate?: string
  shift_type?: 'day' | 'night'
  worked: 0 | 1
}

export interface Payment extends BaseRecord {
  date: string
  employee_id: number
  full_name?: string
  amount: number
  month: string
  comment?: string
  deleted_at?: string
}

export interface SalaryResult {
  ok: boolean
  employee: Employee
  month: string
  total_days: number
  worked_days: number
  salary_gross: number
  tax_rate: number
  salary_net: number
  paid: number
  balance: number
}

// ─── СКЛАД И РАСХОДЫ ──────────────────────────────────────────────────────────

export interface Part extends BaseRecord {
  name: string
  unit: string
  qty_in_stock: number
  price_per_unit: number
  category: string
  deleted_at?: string
}

export interface Expense extends BaseRecord {
  date: string
  truck_id: number
  truck_plate?: string
  category: string
  part_id?: number
  part_name?: string
  name: string
  unit?: string
  qty: number
  price_per_unit: number
  amount: number
  comment?: string
  deleted_at?: string
}

// ─── ОТЧЁТЫ ───────────────────────────────────────────────────────────────────

export interface KpiSummary {
  income: number
  expenses: number
  profit: number
  trucks: number
}

export interface TruckSummary {
  truck_id: number
  plate: string
  model?: string
  income: number
  expenses: number
  profit: number
}

export interface DriverSummary {
  id: number
  full_name: string
  salary_type: string
  salary_gross: number
  salary_fixed?: number
  shifts_count: number
  trips_amount: number
}

export interface MonthlyPoint {
  month: string
  label: string
  income: number
  expenses: number
  profit: number
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number
  table_name: string
  record_id: number
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data?: string
  new_data?: string
  changed_at: string
  user_name: string
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'operator'
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────

export type ApiResponse<T = void> = { ok: true; data?: T; id?: number } | { ok: false; error: string }

export const EXPENSE_CATEGORIES = ['ТО', 'ГСМ', 'Страховка', 'Штраф', 'Запчасть', 'Шины', 'Прочее'] as const
export const PART_CATEGORIES    = ['ДТ', 'Масло', 'Шины', 'Запчасть', 'Расходники', 'Прочее'] as const
export const PART_UNITS         = ['шт', 'л', 'кг', 'м', 'компл'] as const
