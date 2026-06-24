import { ipcMain } from 'electron'
import { getDb } from '../database/db'

export function registerIncomeHandlers() {
  ipcMain.handle('income:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = 'SELECT * FROM income WHERE deleted_at IS NULL'
    const params: any[] = []
    if (filters.from)     { sql += ' AND date >= ?'; params.push(filters.from) }
    if (filters.to)       { sql += ' AND date <= ?'; params.push(filters.to) }
    if (filters.from_who) { sql += ' AND from_who LIKE ?'; params.push(`%${filters.from_who}%`) }
    sql += ' ORDER BY date DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('income:getTotal', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = 'SELECT COALESCE(SUM(amount),0) as total FROM income WHERE deleted_at IS NULL'
    const params: any[] = []
    if (filters.from) { sql += ' AND date >= ?'; params.push(filters.from) }
    if (filters.to)   { sql += ' AND date <= ?'; params.push(filters.to) }
    const row = db.prepare(sql).get(...params) as any
    return row.total
  })

  ipcMain.handle('income:create', (_e, data: any) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO income (date, from_who, account_number, period_from, period_to, amount, comment, project_id)
      VALUES (@date, @from_who, @account_number, @period_from, @period_to, @amount, @comment, @project_id)
    `)
    const result = stmt.run(data)
    return { ok: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('income:update', (_e, id: number, data: any) => {
    const db = getDb()
    db.prepare(`
      UPDATE income SET date=@date, from_who=@from_who, account_number=@account_number,
        period_from=@period_from, period_to=@period_to, amount=@amount,
        comment=@comment, project_id=@project_id, updated_at=datetime('now')
      WHERE id=@id AND deleted_at IS NULL
    `).run({ ...data, id })
    return { ok: true }
  })

  ipcMain.handle('income:remove', (_e, id: number) => {
    const db = getDb()
    db.prepare("UPDATE income SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })
}
