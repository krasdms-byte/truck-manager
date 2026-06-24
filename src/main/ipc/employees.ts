import { ipcMain } from 'electron'
import { getDb } from '../database/db'

// Количество дней в месяце
function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function registerEmployeesHandlers() {
  ipcMain.handle('employees:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = `
      SELECT e.*, tr.plate as truck_plate
      FROM employees e
      LEFT JOIN trucks tr ON e.truck_id = tr.id
      WHERE 1=1
    `
    const params: any[] = []
    if (filters.active !== undefined) { sql += ' AND e.active = ?'; params.push(filters.active) }
    if (filters.role) { sql += ' AND e.role = ?'; params.push(filters.role) }
    sql += ' ORDER BY e.full_name'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('employees:getById', (_e, id: number) => {
    const db = getDb()
    return db.prepare(`
      SELECT e.*, tr.plate as truck_plate
      FROM employees e LEFT JOIN trucks tr ON e.truck_id = tr.id
      WHERE e.id = ?
    `).get(id)
  })

  ipcMain.handle('employees:create', (_e, data: any) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO employees (full_name, role, truck_id, salary_type, salary_gross, salary_fixed, tax_rate)
      VALUES (@full_name, @role, @truck_id, @salary_type, @salary_gross, @salary_fixed, @tax_rate)
    `).run(data)
    return { ok: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('employees:update', (_e, id: number, data: any) => {
    const db = getDb()
    db.prepare(`
      UPDATE employees SET full_name=@full_name, role=@role, truck_id=@truck_id,
        salary_type=@salary_type, salary_gross=@salary_gross, salary_fixed=@salary_fixed,
        tax_rate=@tax_rate, active=@active, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...data, id })
    return { ok: true }
  })

  // ── ЖУРНАЛ СМЕН ──────────────────────────────────────────────────────────────
  ipcMain.handle('employees:getShifts', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = `
      SELECT s.*, e.full_name, tr.plate as truck_plate
      FROM shifts s
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN trucks tr ON s.truck_id = tr.id
      WHERE 1=1
    `
    const params: any[] = []
    if (filters.employee_id) { sql += ' AND s.employee_id = ?'; params.push(filters.employee_id) }
    if (filters.month) {
      sql += ' AND strftime(\'%Y-%m\', s.date) = ?'; params.push(filters.month)
    }
    sql += ' ORDER BY s.date'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('employees:setShift', (_e, data: any) => {
    const db = getDb()
    db.prepare(`
      INSERT INTO shifts (date, employee_id, truck_id, shift_type, worked)
      VALUES (@date, @employee_id, @truck_id, @shift_type, @worked)
      ON CONFLICT(date, employee_id) DO UPDATE SET
        truck_id=excluded.truck_id, shift_type=excluded.shift_type,
        worked=excluded.worked, updated_at=datetime('now')
    `).run(data)
    return { ok: true }
  })

  // ── ВЫПЛАТЫ ──────────────────────────────────────────────────────────────────
  ipcMain.handle('employees:getPayments', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = `
      SELECT p.*, e.full_name
      FROM payments p
      LEFT JOIN employees e ON p.employee_id = e.id
      WHERE p.deleted_at IS NULL
    `
    const params: any[] = []
    if (filters.employee_id) { sql += ' AND p.employee_id = ?'; params.push(filters.employee_id) }
    if (filters.month) { sql += ' AND p.month = ?'; params.push(filters.month) }
    sql += ' ORDER BY p.date DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('employees:addPayment', (_e, data: any) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO payments (date, employee_id, amount, month, comment)
      VALUES (@date, @employee_id, @amount, @month, @comment)
    `).run(data)
    return { ok: true, id: result.lastInsertRowid }
  })

  // ── РАСЧЁТ ЗАРПЛАТЫ ──────────────────────────────────────────────────────────
  ipcMain.handle('employees:getSalary', (_e, employeeId: number, month: string) => {
    const db = getDb()
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as any
    if (!emp) return { ok: false, error: 'Сотрудник не найден' }

    const totalDays  = daysInMonth(month)
    const workedRow  = db.prepare(
      "SELECT COUNT(*) as cnt FROM shifts WHERE employee_id=? AND strftime('%Y-%m',date)=? AND worked=1"
    ).get(employeeId, month) as any
    const workedDays = workedRow.cnt

    // Расчёт нетто-зарплаты
    let salary_net: number
    if (emp.salary_type === 'fixed') {
      salary_net = (emp.salary_fixed || 0) * (1 - emp.tax_rate)
    } else {
      salary_net = (emp.salary_gross / totalDays * workedDays) * (1 - emp.tax_rate)
    }

    // Выплачено за этот месяц
    const paidRow = db.prepare(
      "SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE employee_id=? AND month=? AND deleted_at IS NULL"
    ).get(employeeId, month) as any
    const paid = paidRow.total

    // Сальдо предыдущего месяца
    const [y, m] = month.split('-').map(Number)
    const prevDate = new Date(y, m - 2, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`
    // (упрощённо — берём carry_over если есть, иначе 0)
    const prevCarry = 0  // TODO: рекурсивный расчёт в отчёте

    const balance = salary_net - paid + prevCarry

    return {
      ok: true,
      employee: emp,
      month,
      total_days: totalDays,
      worked_days: workedDays,
      salary_gross: emp.salary_type === 'fixed' ? emp.salary_fixed : emp.salary_gross / totalDays * workedDays,
      tax_rate: emp.tax_rate,
      salary_net: Math.round(salary_net * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    }
  })
}
