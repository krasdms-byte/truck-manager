import { ipcMain } from 'electron'
import { getDb } from '../database/db'
import https from 'https'

function fetchInn(inn: string): Promise<string | null> {
  return new Promise((resolve) => {
    const clean = inn.replace(/\D/g, '')
    const url = `https://egrul.itsoft.ru/${clean}.json`
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const name = json?.name?.short_with_opf || json?.name?.full_with_opf || null
          resolve(name)
        } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

export function registerOrganizationsHandlers() {
  try { ipcMain.removeHandler('organizations:getAll') } catch {}
  try { ipcMain.removeHandler('organizations:create') } catch {}
  try { ipcMain.removeHandler('organizations:update') } catch {}
  try { ipcMain.removeHandler('organizations:remove') } catch {}
  try { ipcMain.removeHandler('organizations:getDebts') } catch {}
  try { ipcMain.removeHandler('organizations:closeDebt') } catch {}

  ipcMain.handle('organizations:getAll', (_e, filter: { type?: string } = {}) => {
    const db = getDb()
    let sql = 'SELECT * FROM organizations WHERE deleted_at IS NULL'
    const params: any[] = []
    if (filter.type && filter.type !== 'both') {
      sql += " AND (type = ? OR type = 'both')"
      params.push(filter.type)
    }
    sql += ' ORDER BY name'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('organizations:create', (_e, data: any) => {
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO organizations (name, inn, type, comment)
      VALUES (@name, @inn, @type, @comment)
    `).run({ name: data.name, inn: data.inn || null, type: data.type || 'both', comment: data.comment || null })
    return { ok: true, id: r.lastInsertRowid }
  })

  ipcMain.handle('organizations:update', (_e, id: number, data: any) => {
    const db = getDb()
    db.prepare(`
      UPDATE organizations SET name=@name, inn=@inn, type=@type, comment=@comment,
        updated_at=datetime('now') WHERE id=@id
    `).run({ ...data, id })
    return { ok: true }
  })

  ipcMain.handle('organizations:remove', (_e, id: number) => {
    const db = getDb()
    db.prepare("UPDATE organizations SET deleted_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })

  // Получить все неоплаченные долги
  ipcMain.handle('organizations:getDebts', (_e, filter: { from?: string; to?: string } = {}) => {
    const db = getDb()
    let sql = `
      SELECT e.*, o.name as org_name, o.inn as org_inn, t.plate as truck_plate
      FROM expenses e
      LEFT JOIN organizations o ON e.organization_id = o.id
      LEFT JOIN trucks t ON e.truck_id = t.id
      WHERE e.deleted_at IS NULL AND e.pay_status = 'debt' AND e.debt_closed_at IS NULL
    `
    const params: any[] = []
    if (filter.from) { sql += ' AND e.date >= ?'; params.push(filter.from) }
    if (filter.to)   { sql += ' AND e.date <= ?'; params.push(filter.to) }
    sql += ' ORDER BY e.date DESC'
    return { ok: true, data: db.prepare(sql).all(...params) }
  })

  // Закрыть долг (привязать к поступлению)
  ipcMain.handle('organizations:lookupInn', async (_e, inn: string) => {
    try {
      const name = await fetchInn(inn)
      return { ok: true, name }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('organizations:closeDebt', (_e, expenseId: number, incomeId?: number) => {
    const db = getDb()
    db.prepare(`
      UPDATE expenses
      SET debt_closed_at = datetime('now'),
          debt_closed_income_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(incomeId || null, expenseId)
    return { ok: true }
  })
}
