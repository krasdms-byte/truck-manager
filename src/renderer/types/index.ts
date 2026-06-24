// Типы для window.api, предоставляемого через preload.ts
declare global {
  interface Window {
    api: {
      auth: {
        login:  (data: { username: string; password: string }) => Promise<{ ok: boolean; token?: string; user?: any; error?: string }>
        logout: () => Promise<{ ok: boolean }>
        verify: (token?: string) => Promise<{ ok: boolean; user?: any }>
      }
      income: {
        getAll:   (filters?: IncomeFilters) => Promise<Income[]>
        create:   (data: Partial<Income>) => Promise<{ ok: boolean; id?: number }>
        update:   (id: number, data: Partial<Income>) => Promise<{ ok: boolean }>
        remove:   (id: number) => Promise<{ ok: boolean }>
        getTotal: (filters?: IncomeFilters) => Promise<number>
      }
      trips: {
        getAll:    (filters?: TripFilters) => Promise<Trip[]>
        create:    (data: Partial<Trip>) => Promise<{ ok: boolean; id?: number }>
        update:    (id: number, data: Partial<Trip>) => Promise<{ ok: boolean }>
        remove:    (id: number) => Promise<{ ok: boolean }>
        getSummary:(filters?: TripFilters) => Promise<TruckSummary[]>
      }
      employees: {
        getAll:      (filters?: { active?: number; role?: string }) => Promise<Employee[]>
        getById:     (id: number) => Promise<Employee>
        create:      (data: Partial<Employee>) => Promise<{ ok: boolean; id?: number }>
        update:      (id: number, data: Partial<Employee>) => Promise<{ ok: boolean }>
        getShifts:   (filters?: { employee_id?: number; month?: string }) => Promise<Shift[]>
        setShift:    (data: Partial<Shift>) => Promise<{ ok: boolean }>
        getPayments: (filters?: { employee_id?: number; month?: string }) => Promise<Payment[]>
        addPayment:  (data: Partial<Payment>) => Promise<{ ok: boolean; id?: number }>
        getSalary:   (employeeId: number, month: string) => Promise<SalaryResult>
      }
      expenses: {
        getAll:  (filters?: ExpenseFilters) => Promise<Expense[]>
        create:  (data: Partial<Expense>) => Promise<{ ok: boolean; id?: number }>
        update:  (id: number, data: Partial<Expense>) => Promise<{ ok: boolean }>
        remove:  (id: number) => Promise<{ ok: boolean }>
      }
      parts: {
        getAll:      (filters?: { category?: string; search?: string }) => Promise<Part[]>
        create:      (data: Partial<Part>) => Promise<{ ok: boolean; id?: number }>
        update:      (id: number, data: Partial<Part>) => Promise<{ ok: boolean }>
        remove:      (id: number) => Promise<{ ok: boolean }>
        importExcel: (filePath: string) => Promise<{ ok: boolean; error?: string }>
      }
      trucks: {
        getAll:  () => Promise<Truck[]>
        create:  (data: Partial<Truck>) => Promise<{ ok: boolean; id?: number }>
        update:  (id: number, data: Partial<Truck>) => Promise<{ ok: boolean }>
      }
      reports: {
        getSummary:  (filters: { from: string; to: string }) => Promise<KPISummary>
        getByTruck:  (filters: { from: string; to: string }) => Promise<TruckReport[]>
        getByDriver: (filters: { from: string; to: string }) => Promise<DriverReport[]>
        getMonthly:  (year: number) => Promise<MonthlyData[]>
      }
      backup: {
        create:  () => Promise<{ ok: boolean; path?: string; error?: string }>
        list:    () => Promise<{ ok: boolean; files?: BackupFile[] }>
        restore: (fileName: string) => Promise<{ ok: boolean; message?: string; error?: string }>
      }
      audit: {
        getLog: (filters?: { table_name?: string; record_id?: number }) => Promise<AuditEntry[]>
      }
    }
  }
}

// ─── Модели данных ────────────────────────────────────────────────────────────

export interface Truck {
  id: number
  plate: string
  model?: string
  year?: number
  active: number
}

export interface Employee {
  id: number
  full_name: string
  role: 'driver' | 'mechanic'
  truck_id?: number
  truck_plate?: string
  salary_type: 'formula' | 'fixed'
  salary_gross: number
  salary_fixed?: number
  tax_rate: number
  active: number
}

export interface Income {
  id: number
  date: string
  from_who: string
  account_number?: string
  period_from?: string
  period_to?: string
  amount: number
  comment?: string
}

export interface Trip {
  id: number
  date: string
  truck_id: number
  truck_plate?: string
  driver_id: number
  driver_name?: string
  project_id?: number
  project_name?: string
  shift_type: 'day' | 'night'
  pricing_mode: 'per_trip' | 'per_ton_km'
  trips_count: number
  price_per_trip?: number
  tons?: number
  distance_km?: number
  price_per_ton_km?: number
  amount: number
  comment?: string
}

export interface Shift {
  id: number
  date: string
  employee_id: number
  truck_id?: number
  shift_type?: 'day' | 'night'
  worked: number
}

export interface Payment {
  id: number
  date: string
  employee_id: number
  amount: number
  month: string
  comment?: string
}

export interface Part {
  id: number
  name: string
  unit: string
  qty_in_stock: number
  price_per_unit: number
  category: string
}

export interface Expense {
  id: number
  date: string
  truck_id: number
  truck_plate?: string
  category: string
  part_id?: number
  name: string
  unit?: string
  qty: number
  price_per_unit: number
  amount: number
  comment?: string
}

export interface KPISummary {
  income: number
  expenses: number
  profit: number
  trucks: number
}

export interface TruckSummary {
  truck_id: number
  plate: string
  total_amount: number
  total_trips: number
}

export interface TruckReport {
  truck_id: number
  plate: string
  model?: string
  income: number
  expenses: number
  profit: number
}

export interface DriverReport {
  id: number
  full_name: string
  shifts_count: number
  trips_amount: number
}

export interface MonthlyData {
  month: string
  label: string
  income: number
  expenses: number
  profit: number
}

export interface SalaryResult {
  ok: boolean
  employee?: Employee
  month?: string
  total_days?: number
  worked_days?: number
  salary_gross?: number
  salary_net?: number
  paid?: number
  balance?: number
  error?: string
}

export interface BackupFile {
  name: string
  path: string
  size: number
  date: string
}

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

export interface IncomeFilters  { from?: string; to?: string; from_who?: string }
export interface TripFilters    { from?: string; to?: string; truck_id?: number; driver_id?: number; project_id?: number; limit?: number }
export interface ExpenseFilters { from?: string; to?: string; truck_id?: number; category?: string; pay_status?: 'paid' | 'debt'; organization_id?: number; project_id?: number }

export {}
