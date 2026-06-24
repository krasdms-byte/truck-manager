import { ipcMain } from 'electron'
import { getDb } from '../database/db'

export function registerDictionaryHandlers() {

  // ── Категории ──────────────────────────────────────────────────────────────
  ipcMain.handle('dict:categories:getAll', () => {
    return getDb().prepare('SELECT * FROM dict_categories ORDER BY sort_order, name').all()
  })
  ipcMain.handle('dict:categories:create', (_e, name: string) => {
    try {
      const r = getDb().prepare('INSERT INTO dict_categories (name) VALUES (?)').run(name.trim())
      return { ok: true, id: r.lastInsertRowid }
    } catch { return { ok: false, error: 'Такая категория уже существует' } }
  })
  ipcMain.handle('dict:categories:update', (_e, id: number, name: string) => {
    getDb().prepare('UPDATE dict_categories SET name=? WHERE id=?').run(name.trim(), id)
    return { ok: true }
  })
  ipcMain.handle('dict:categories:remove', (_e, id: number) => {
    getDb().prepare('DELETE FROM dict_categories WHERE id=?').run(id)
    return { ok: true }
  })

  // ── Единицы измерения ──────────────────────────────────────────────────────
  ipcMain.handle('dict:units:getAll', () => {
    return getDb().prepare('SELECT * FROM dict_units ORDER BY sort_order, name').all()
  })
  ipcMain.handle('dict:units:create', (_e, name: string) => {
    try {
      const r = getDb().prepare('INSERT INTO dict_units (name) VALUES (?)').run(name.trim())
      return { ok: true, id: r.lastInsertRowid }
    } catch { return { ok: false, error: 'Такая единица уже существует' } }
  })
  ipcMain.handle('dict:units:update', (_e, id: number, name: string) => {
    getDb().prepare('UPDATE dict_units SET name=? WHERE id=?').run(name.trim(), id)
    return { ok: true }
  })
  ipcMain.handle('dict:units:remove', (_e, id: number) => {
    getDb().prepare('DELETE FROM dict_units WHERE id=?').run(id)
    return { ok: true }
  })

  // ── Наименования (справочник материалов/работ) ─────────────────────────────
  ipcMain.handle('dict:items:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = 'SELECT * FROM dict_items WHERE deleted_at IS NULL'
    const params: any[] = []
    if (filters.category) { sql += ' AND category=?'; params.push(filters.category) }
    if (filters.search)   { sql += ' AND name LIKE ?'; params.push('%' + filters.search + '%') }
    sql += ' ORDER BY name'
    return db.prepare(sql).all(...params)
  })
  ipcMain.handle('dict:items:create', (_e, data: any) => {
    const r = getDb().prepare(`
      INSERT INTO dict_items (name, category, unit, price_per_unit)
      VALUES (@name, @category, @unit, @price_per_unit)
    `).run(data)
    return { ok: true, id: r.lastInsertRowid }
  })
  ipcMain.handle('dict:items:update', (_e, id: number, data: any) => {
    getDb().prepare(`
      UPDATE dict_items SET name=@name, category=@category, unit=@unit,
        price_per_unit=@price_per_unit, updated_at=datetime('now')
      WHERE id=@id AND deleted_at IS NULL
    `).run({ ...data, id })
    return { ok: true }
  })
  ipcMain.handle('dict:items:remove', (_e, id: number) => {
    getDb().prepare("UPDATE dict_items SET deleted_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })
}
