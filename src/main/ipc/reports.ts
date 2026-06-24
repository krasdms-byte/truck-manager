import { ipcMain } from 'electron'
import { getDb } from '../database/db'

export function registerReportHandlers() {
  // Сводка KPI за период
  ipcMain.handle('reports:getSummary', (_e, { from, to }: { from: string; to: string }) => {
    const db = getDb()
    const income   = (db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM income WHERE deleted_at IS NULL AND date>=? AND date<=?").get(from, to) as any).v
    const expenses = (db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE deleted_at IS NULL AND date>=? AND date<=?").get(from, to) as any).v
    const trucks   = (db.prepare("SELECT COUNT(*) as v FROM trucks WHERE active=1").get() as any).v
    return {
      income:   Math.round(income   * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      profit:   Math.round((income - expenses) * 100) / 100,
      trucks,
    }
  })

  // Разбивка по самосвалам
  ipcMain.handle('reports:getByTruck', (_e, { from, to }: { from: string; to: string }) => {
    const db = getDb()
    const trucks = db.prepare('SELECT * FROM trucks WHERE active=1').all() as any[]

    return trucks.map((truck: any) => {
      const income   = (db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM trips WHERE deleted_at IS NULL AND truck_id=? AND date>=? AND date<=?").get(truck.id, from, to) as any).v
      const expenses = (db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE deleted_at IS NULL AND truck_id=? AND date>=? AND date<=?").get(truck.id, from, to) as any).v
      return {
        truck_id: truck.id,
        plate: truck.plate,
        model: truck.model,
        income:   Math.round(income   * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        profit:   Math.round((income - expenses) * 100) / 100,
      }
    })
  })

  // Разбивка по водителям
  ipcMain.handle('reports:getByDriver', (_e, { from, to }: { from: string; to: string }) => {
    const db = getDb()
    return db.prepare(`
      SELECT e.id, e.full_name, e.salary_type, e.salary_gross, e.salary_fixed,
        (SELECT COUNT(DISTINCT s.date) FROM shifts s WHERE s.employee_id=e.id AND s.worked=1 AND s.date>=? AND s.date<=?) as shifts_count,
        (SELECT COALESCE(SUM(t.amount),0) FROM trips t WHERE t.driver_id=e.id AND t.deleted_at IS NULL AND t.date>=? AND t.date<=?) as trips_amount
      FROM employees e
      WHERE e.active=1 AND e.role='driver'
      ORDER BY e.full_name
    `).all(from, to, from, to)
  })

  // Помесячная разбивка за год (для графика)
  ipcMain.handle('reports:getMonthly', (_e, year: number) => {
    const db = getDb()
    const months = Array.from({length: 12}, (_, i) => {
      const m = String(i + 1).padStart(2, '0')
      return `${year}-${m}`
    })

    return months.map(month => {
      const from = `${month}-01`
      const to   = `${month}-31`
      const income   = (db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM income WHERE deleted_at IS NULL AND date>=? AND date<=?").get(from, to) as any).v
      const expenses = (db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE deleted_at IS NULL AND date>=? AND date<=?").get(from, to) as any).v
      return {
        month,
        label: new Date(year, parseInt(month.split('-')[1]) - 1, 1).toLocaleString('ru', { month: 'short' }),
        income:   Math.round(income   * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        profit:   Math.round((income - expenses) * 100) / 100,
      }
    })
  })

  // Сводка долгов по организациям
  ipcMain.handle('reports:getDebts', (_e, { from, to }: { from?: string; to?: string } = {}) => {
    const db = getDb()
    let sql = `
      SELECT
        o.id as org_id, o.name as org_name, o.inn,
        COUNT(e.id) as items_count,
        COALESCE(SUM(e.amount), 0) as total_debt,
        GROUP_CONCAT(e.name || ' (' || e.date || ') — ' || CAST(ROUND(e.amount) as INTEGER) || ' руб.', '; ') as items_list
      FROM expenses e
      JOIN organizations o ON e.organization_id = o.id
      WHERE e.deleted_at IS NULL
        AND e.pay_status = 'debt'
        AND e.debt_closed_at IS NULL
    `
    const params: any[] = []
    if (from) { sql += ' AND e.date >= ?'; params.push(from) }
    if (to)   { sql += ' AND e.date <= ?'; params.push(to) }
    sql += ' GROUP BY o.id ORDER BY total_debt DESC'
    const expenseDebts = db.prepare(sql).all(...params) as any[]

    // Долги по проживанию/питанию из accommodation_debts
    let accSql = `
      SELECT
        COALESCE(o.id, -1) as org_id,
        CASE ad.type WHEN 'accommodation' THEN 'Проживание' ELSE 'Питание' END || ' (проект: ' || p.name || ')' as org_name,
        o.inn as inn,
        COUNT(ad.id) as items_count,
        COALESCE(SUM(ad.amount), 0) as total_debt,
        GROUP_CONCAT(p.name || ' ' || ad.period_month || ' — ' || CAST(ROUND(ad.amount) as INTEGER) || ' руб.', '; ') as items_list
      FROM accommodation_debts ad
      JOIN projects p ON ad.project_id = p.id
      LEFT JOIN project_accommodation pa ON pa.project_id = p.id
      LEFT JOIN organizations o ON (ad.type='accommodation' AND o.id=pa.accommodation_org_id) OR (ad.type='meal' AND o.id=pa.meal_org_id)
      WHERE ad.closed_at IS NULL
    `
    const accParams: any[] = []
    accSql += ' GROUP BY ad.type, ad.project_id, o.id ORDER BY total_debt DESC'
    const accDebts = db.prepare(accSql).all(...accParams) as any[]

    return [...expenseDebts, ...accDebts]
  })

  // Сводка по проекту + организации (выполнено / оплачено / долг)
  ipcMain.handle('reports:getProjectOrgSummary', (_e, { from, to }: { from?: string; to?: string } = {}) => {
    const db = getDb()
    // Проекты с поступлениями и долгами
    const projects = db.prepare(`
      SELECT p.id, p.name, p.client_name,
        COALESCE((SELECT SUM(t.amount) FROM trips t WHERE t.project_id=p.id AND t.deleted_at IS NULL
          ${from ? 'AND t.date >= ?' : ''} ${to ? 'AND t.date <= ?' : ''}), 0) as trips_amount,
        COALESCE((SELECT SUM(i.amount) FROM income i WHERE i.project_id=p.id AND i.deleted_at IS NULL
          ${from ? 'AND i.date >= ?' : ''} ${to ? 'AND i.date <= ?' : ''}), 0) as paid_amount,
        COALESCE((SELECT SUM(ex.amount) FROM expenses ex
          WHERE ex.project_id=p.id AND ex.deleted_at IS NULL
          ${from ? 'AND ex.date >= ?' : ''} ${to ? 'AND ex.date <= ?' : ''}), 0)
        + COALESCE((SELECT SUM(ad.amount) FROM accommodation_debts ad WHERE ad.project_id=p.id AND ad.closed_at IS NULL), 0) as expenses_amount,
        COALESCE((SELECT SUM(e.amount) FROM expenses e
          JOIN organizations o ON e.organization_id=o.id
          WHERE o.name=p.client_name AND e.pay_status='debt' AND e.debt_closed_at IS NULL
          ${from ? 'AND e.date >= ?' : ''} ${to ? 'AND e.date <= ?' : ''}), 0) as client_debt,
        COALESCE((SELECT SUM(ad.amount) FROM accommodation_debts ad
          WHERE ad.project_id=p.id AND ad.closed_at IS NULL), 0) as acc_debt
      FROM projects p
      WHERE p.deleted_at IS NULL
      ORDER BY p.name
    `).all(...(from && to ? [from, to, from, to, from, to, from, to] : from ? [from, from, from, from] : to ? [to, to, to, to] : []))
    return projects
  })
}
