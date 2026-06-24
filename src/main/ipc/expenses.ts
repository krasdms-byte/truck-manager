import { ipcMain } from 'electron'
import { getDb } from '../database/db'

export function registerExpensesHandlers() {
  ipcMain.handle('expenses:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = `
      SELECT ex.*, tr.plate as truck_plate, p.name as part_name,
        o.name as org_name, pr.name as project_name,
        CASE
          WHEN ex.pay_status = 'paid' THEN 'paid'
          WHEN pr.client_org_id IS NOT NULL AND ex.organization_id = pr.client_org_id THEN 'mutual'
          ELSE 'debt'
        END as debt_status
      FROM expenses ex
      LEFT JOIN trucks tr ON ex.truck_id = tr.id
      LEFT JOIN parts p ON ex.part_id = p.id
      LEFT JOIN organizations o ON ex.organization_id = o.id
      LEFT JOIN projects pr ON ex.project_id = pr.id
      WHERE ex.deleted_at IS NULL
    `
    const params: any[] = []
    if (filters.from)       { sql += ' AND ex.date >= ?'; params.push(filters.from) }
    if (filters.to)         { sql += ' AND ex.date <= ?'; params.push(filters.to) }
    if (filters.truck_id)   { sql += ' AND ex.truck_id = ?'; params.push(filters.truck_id) }
    if (filters.category)   { sql += ' AND ex.category = ?'; params.push(filters.category) }
    if (filters.project_id) { sql += ' AND ex.project_id = ?'; params.push(filters.project_id) }
    if (filters.pay_status) { sql += ' AND ex.pay_status = ?'; params.push(filters.pay_status) }
    sql += ' ORDER BY ex.date DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('expenses:create', (_e, data: any) => {
    const db = getDb()
    const amount = (data.qty || 1) * (data.price_per_unit || 0)

    const insertExpense = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO expenses (date, truck_id, category, part_id, name, unit, qty, price_per_unit, amount, comment, organization_id, pay_status, project_id)
        VALUES (@date, @truck_id, @category, @part_id, @name, @unit, @qty, @price_per_unit, @amount, @comment, @organization_id, @pay_status, @project_id)
      `).run({ ...data, amount, organization_id: data.organization_id ?? null, pay_status: data.pay_status || 'paid', project_id: data.project_id ?? null })

      // Если со склада — уменьшаем остаток
      if (data.part_id) {
        db.prepare(`
          UPDATE parts SET qty_in_stock = qty_in_stock - @qty, updated_at=datetime('now')
          WHERE id = @part_id AND qty_in_stock >= @qty
        `).run({ qty: data.qty || 1, part_id: data.part_id })
      }

      return result.lastInsertRowid
    })

    const id = insertExpense()
    return { ok: true, id }
  })

  ipcMain.handle('expenses:update', (_e, id: number, data: any) => {
    const db = getDb()
    const amount = (data.qty || 1) * (data.price_per_unit || 0)
    db.prepare(`
      UPDATE expenses SET date=@date, truck_id=@truck_id, category=@category,
        part_id=@part_id, name=@name, unit=@unit, qty=@qty,
        price_per_unit=@price_per_unit, amount=@amount, comment=@comment,
        organization_id=@organization_id, pay_status=@pay_status, project_id=@project_id,
        updated_at=datetime('now')
      WHERE id=@id AND deleted_at IS NULL
    `).run({ ...data, amount, id, organization_id: data.organization_id ?? null, pay_status: data.pay_status || 'paid', project_id: data.project_id ?? null })
    return { ok: true }
  })

  ipcMain.handle('expenses:remove', (_e, id: number) => {
    const db = getDb()
    db.prepare("UPDATE expenses SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })
}

export function registerPartsHandlers() {
  ipcMain.handle('parts:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = 'SELECT * FROM parts WHERE deleted_at IS NULL'
    const params: any[] = []
    if (filters.category)     { sql += ' AND category = ?'; params.push(filters.category) }
    if (filters.search)       { sql += ' AND name LIKE ?'; params.push(`%${filters.search}%`) }
    if (filters.in_stock_only) { sql += ' AND qty_in_stock > 0' }
    sql += ' ORDER BY category, name'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('parts:create', (_e, data: any) => {
    const db = getDb()
    const result = db.prepare(`
      INSERT INTO parts (name, unit, qty_in_stock, price_per_unit, category, supplier)
      VALUES (@name, @unit, @qty_in_stock, @price_per_unit, @category, @supplier)
    `).run(data)
    return { ok: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('parts:update', (_e, id: number, data: any) => {
    const db = getDb()
    db.prepare(`
      UPDATE parts SET name=@name, unit=@unit, qty_in_stock=@qty_in_stock,
        price_per_unit=@price_per_unit, category=@category, supplier=@supplier, updated_at=datetime('now')
      WHERE id=@id AND deleted_at IS NULL
    `).run({ ...data, id })
    return { ok: true }
  })

  ipcMain.handle('parts:remove', (_e, id: number) => {
    const db = getDb()
    db.prepare("UPDATE parts SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })

  ipcMain.handle('parts:importExcel', (_e, _filePath: string) => {
    // TODO: реализовать в этапе 7
    return { ok: false, error: 'Импорт Excel будет реализован в этапе 7' }
  })
}

export function registerPartsReceiptsHandlers() {
  ipcMain.handle('parts:receipts:getAll', (_e, partId?: number) => {
    const db = getDb()
    let sql = `
      SELECT r.*, p.name as part_name, p.unit
      FROM parts_receipts r
      LEFT JOIN parts p ON r.part_id = p.id
      WHERE 1=1
    `
    const params: any[] = []
    if (partId) { sql += ' AND r.part_id = ?'; params.push(partId) }
    sql += ' ORDER BY r.date DESC, r.created_at DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('parts:receipts:create', (_e, data: any) => {
    const db = getDb()
    const receipt = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO parts_receipts (part_id, date, qty, price_per_unit, supplier, comment)
        VALUES (@part_id, @date, @qty, @price_per_unit, @supplier, @comment)
      `).run(data)

      // Увеличиваем остаток и обновляем цену и продавца
      db.prepare(`
        UPDATE parts SET
          qty_in_stock = qty_in_stock + @qty,
          price_per_unit = @price_per_unit,
          supplier = @supplier,
          last_received_date = @date,
          updated_at = datetime('now')
        WHERE id = @part_id
      `).run(data)

      return r.lastInsertRowid
    })
    return { ok: true, id: receipt() }
  })

  ipcMain.handle('parts:receipts:remove', (_e, id: number) => {
    const db = getDb()
    // Получаем запись чтобы откатить остаток
    const receipt = db.prepare('SELECT * FROM parts_receipts WHERE id = ?').get(id) as any
    if (!receipt) return { ok: false, error: 'Запись не найдена' }
    db.transaction(() => {
      db.prepare('DELETE FROM parts_receipts WHERE id = ?').run(id)
      db.prepare(`UPDATE parts SET qty_in_stock = qty_in_stock - ?, updated_at = datetime('now') WHERE id = ?`).run(receipt.qty, receipt.part_id)
    })()
    return { ok: true }
  })
}
