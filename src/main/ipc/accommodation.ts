import { ipcMain } from 'electron'
import { getDb } from '../database/db'

function calcDays(projectId: number, month: string) {
  const db = getDb()
  const settings = db.prepare('SELECT * FROM project_accommodation WHERE project_id=?').get(projectId) as any
  if (!settings) return { ok: false, error: 'Настройки не заданы' }

  const parts = month.split('-').map(Number)
  const year = parts[0], mon = parts[1]
  const monthStart = month + '-01'
  // Последний день месяца
  const monthEnd = new Date(year, mon, 0).toISOString().slice(0, 10)
  // Верхняя граница: минимум из конца месяца и end_date проекта
  const periodEnd = (settings.end_date && settings.end_date < monthEnd) ? settings.end_date : monthEnd

  const workers = db.prepare(
    'SELECT * FROM project_worker_dates WHERE project_id=? AND start_date<=? AND (end_date IS NULL OR end_date>=?)'
  ).all(projectId, monthEnd, monthStart) as any[]

  if (workers.length === 0) return { ok: false, error: 'Нет водителей за период' }

  // Кол-во календарных дней в периоде (для отображения в таблице)
  const calendarDays = Math.ceil((new Date(periodEnd).getTime() - new Date(monthStart).getTime()) / 86400000) + 1

  // Сумма считается по каждому водителю отдельно (его реальные дни × стоимость)
  let totalAmount_accommodation = 0
  let totalAmount_meal = 0
  let totalDays = 0

  for (const w of workers) {
    const wStart = w.start_date > monthStart ? w.start_date : monthStart
    const wEnd = (w.end_date && w.end_date < periodEnd) ? w.end_date : periodEnd
    const days = Math.max(0, Math.ceil((new Date(wEnd).getTime() - new Date(wStart).getTime()) / 86400000) + 1)
    totalDays += days
    totalAmount_accommodation += days * (settings.accommodation_cost || 0)
    totalAmount_meal += days * (settings.meal_cost || 0)
  }

  for (const type of ['accommodation', 'meal']) {
    const amount = type === 'accommodation' ? totalAmount_accommodation : totalAmount_meal
    const existing = db.prepare(
      'SELECT id FROM accommodation_debts WHERE project_id=? AND period_month=? AND type=?'
    ).get(projectId, month, type) as any
    if (amount === 0) {
      // Сумма стала 0 — удаляем запись долга
      if (existing) {
        db.prepare('DELETE FROM accommodation_debts WHERE id=?').run(existing.id)
      }
      continue
    }
    if (existing) {
      db.prepare(
        "UPDATE accommodation_debts SET amount=?, days_count=?, workers_count=?, updated_at=datetime('now') WHERE project_id=? AND period_month=? AND type=?"
      ).run(amount, calendarDays, workers.length, projectId, month, type)
    } else {
      db.prepare(
        'INSERT INTO accommodation_debts (project_id, period_month, type, amount, days_count, workers_count) VALUES (?,?,?,?,?,?)'
      ).run(projectId, month, type, amount, calendarDays, workers.length)
    }
  }

  return { ok: true, workers_count: workers.length, total_days: totalDays, calendar_days: calendarDays }
}

export function registerAccommodationHandlers() {
  const handlers = [
    'accommodation:getSettings', 'accommodation:saveSettings',
    'accommodation:getWorkers', 'accommodation:setWorker', 'accommodation:removeWorker',
    'accommodation:getDebts', 'accommodation:calcMonth', 'accommodation:calcDebts',
    'accommodation:closeDebt', 'accommodation:getAllDebts', 'accommodation:saveDebt',
    'accommodation:closeMultiple',
    'accommodation:setActualAmount',
  ]
  handlers.forEach(h => ipcMain.removeHandler(h))

  ipcMain.handle('accommodation:getSettings', (_e, projectId: number) => {
    return getDb().prepare('SELECT * FROM project_accommodation WHERE project_id=?').get(projectId) || null
  })

  ipcMain.handle('accommodation:saveSettings', (_e, projectId: number, data: any) => {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM project_accommodation WHERE project_id=?').get(projectId)
    if (existing) {
      db.prepare(
        "UPDATE project_accommodation SET accommodation_cost=?, meal_cost=?, accommodation_org_id=?, meal_org_id=?, end_date=?, updated_at=datetime('now') WHERE project_id=?"
      ).run(data.accommodation_cost, data.meal_cost, data.accommodation_org_id || null, data.meal_org_id || null, data.end_date || null, projectId)
    } else {
      db.prepare(
        'INSERT INTO project_accommodation (project_id, accommodation_cost, meal_cost, accommodation_org_id, meal_org_id, end_date) VALUES (?,?,?,?,?,?)'
      ).run(projectId, data.accommodation_cost, data.meal_cost, data.accommodation_org_id || null, data.meal_org_id || null, data.end_date || null)
    }
    return { ok: true }
  })

  ipcMain.handle('accommodation:getWorkers', (_e, projectId: number) => {
    return getDb().prepare(
      'SELECT wd.*, e.full_name, e.id as employee_id FROM project_worker_dates wd JOIN employees e ON wd.employee_id=e.id WHERE wd.project_id=? ORDER BY wd.start_date'
    ).all(projectId)
  })

  ipcMain.handle('accommodation:setWorker', (_e, projectId: number, employeeId: number, startDate: string, endDate?: string) => {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM project_worker_dates WHERE project_id=? AND employee_id=?').get(projectId, employeeId)
    if (existing) {
      db.prepare("UPDATE project_worker_dates SET start_date=?, end_date=?, updated_at=datetime('now') WHERE project_id=? AND employee_id=?")
        .run(startDate, endDate || null, projectId, employeeId)
    } else {
      db.prepare('INSERT INTO project_worker_dates (project_id, employee_id, start_date, end_date) VALUES (?,?,?,?)')
        .run(projectId, employeeId, startDate, endDate || null)
    }
    return { ok: true }
  })

  ipcMain.handle('accommodation:removeWorker', (_e, projectId: number, employeeId: number) => {
    getDb().prepare('DELETE FROM project_worker_dates WHERE project_id=? AND employee_id=?').run(projectId, employeeId)
    return { ok: true }
  })

  ipcMain.handle('accommodation:getDebts', (_e, projectId: number) => {
    return getDb().prepare(`
      SELECT d.*,
        CASE d.type
          WHEN 'accommodation' THEN oa.name
          WHEN 'meal'          THEN om.name
        END as org_name,
        CASE d.type
          WHEN 'accommodation' THEN pa.accommodation_org_id
          WHEN 'meal'          THEN pa.meal_org_id
        END as org_id,
        pr.client_org_id,
        CASE
          WHEN d.closed_at IS NOT NULL THEN 'paid'
          WHEN pr.client_org_id IS NOT NULL AND (
            (d.type='accommodation' AND pa.accommodation_org_id = pr.client_org_id) OR
            (d.type='meal'          AND pa.meal_org_id          = pr.client_org_id)
          ) THEN 'mutual'
          ELSE 'debt'
        END as debt_status
      FROM accommodation_debts d
      LEFT JOIN project_accommodation pa ON pa.project_id = d.project_id
      LEFT JOIN organizations oa ON oa.id = pa.accommodation_org_id
      LEFT JOIN organizations om ON om.id = pa.meal_org_id
      LEFT JOIN projects pr ON pr.id = d.project_id
      WHERE d.project_id=?
      ORDER BY d.period_month DESC, d.type
    `).all(projectId)
  })

  ipcMain.handle('accommodation:getAllDebts', () => {
    return getDb().prepare(
      'SELECT d.*, p.name as project_name FROM accommodation_debts d JOIN projects p ON d.project_id=p.id WHERE d.closed_at IS NULL ORDER BY d.period_month DESC'
    ).all()
  })

  ipcMain.handle('accommodation:calcMonth', (_e, projectId: number, month: string) => {
    return calcDays(projectId, month)
  })

  ipcMain.handle('accommodation:calcDebts', (_e, projectId: number, month: string) => {
    return calcDays(projectId, month)
  })

  ipcMain.handle('accommodation:closeDebt', (_e, debtId: number, closeAmount: number, incomeId?: number) => {
    getDb().prepare(
      "UPDATE accommodation_debts SET closed_at=datetime('now'), closed_amount=?, income_id=?, updated_at=datetime('now') WHERE id=?"
    ).run(closeAmount, incomeId || null, debtId)
    return { ok: true }
  })

  ipcMain.handle('accommodation:saveDebt', (_e, data: any) => {
    return { ok: true }
  })

  ipcMain.handle('accommodation:setActualAmount', (_e, debtId: number, actualAmount: number | null) => {
    getDb().prepare(
      "UPDATE accommodation_debts SET actual_amount=?, updated_at=datetime('now') WHERE id=?"
    ).run(actualAmount, debtId)
    return { ok: true }
  })

  ipcMain.handle('accommodation:closeMultiple', (_e, ids: number[], amount: number, incomeId?: number) => {
    const db = getDb()
    for (const id of ids) {
      db.prepare(
        "UPDATE accommodation_debts SET closed_at=datetime('now'), closed_amount=?, income_id=?, updated_at=datetime('now') WHERE id=?"
      ).run(amount / ids.length, incomeId || null, id)
    }
    return { ok: true }
  })
}
