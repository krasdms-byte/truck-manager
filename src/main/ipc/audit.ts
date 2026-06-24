import { ipcMain } from 'electron'
import { getDb } from '../database/db'

export function registerAuditHandlers() {
  // Защита от двойной регистрации при hot reload
  try { ipcMain.removeHandler('audit:getLog') } catch {}
  try { ipcMain.removeHandler('audit:getTables') } catch {}

  ipcMain.handle('audit:getLog', (_e, filter: {
    table_name?: string
    action?: string
    date_from?: string
    date_to?: string
    limit?: number
  } = {}) => {
    try {
      const db = getDb()
      const conditions: string[] = []
      const params: any[] = []
      if (filter.table_name) { conditions.push('table_name = ?'); params.push(filter.table_name) }
      if (filter.action)     { conditions.push('action = ?');     params.push(filter.action) }
      if (filter.date_from)  { conditions.push("date(changed_at) >= ?"); params.push(filter.date_from) }
      if (filter.date_to)    { conditions.push("date(changed_at) <= ?"); params.push(filter.date_to) }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const limit = filter.limit ?? 500
      const rows = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY changed_at DESC LIMIT ?`).all(...params, limit)
      return { ok: true, data: rows }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('audit:getTables', () => {
    try {
      const db = getDb()
      const rows = db.prepare(`SELECT DISTINCT table_name FROM audit_log ORDER BY table_name`).all() as { table_name: string }[]
      return { ok: true, data: rows.map(r => r.table_name) }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}
