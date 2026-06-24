import { ipcMain } from 'electron'
import { getDb } from '../database/db'

function calcAmount(data: any): number {
  if (data.pricing_mode === 'per_trip') {
    return (data.trips_count || 1) * (data.price_per_trip || 0)
  } else {
    return (data.tons || 0) * (data.distance_km || 0) * (data.price_per_ton_km || 0) * (data.trips_count || 1)
  }
}

export function registerTripsHandlers() {
  ipcMain.handle('trips:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = `
      SELECT t.*, tr.plate as truck_plate, e.full_name as driver_name
      FROM trips t
      LEFT JOIN trucks tr ON t.truck_id = tr.id
      LEFT JOIN employees e ON t.driver_id = e.id
      WHERE t.deleted_at IS NULL
    `
    const params: any[] = []
    if (filters.from)      { sql += ' AND t.date >= ?'; params.push(filters.from) }
    if (filters.to)        { sql += ' AND t.date <= ?'; params.push(filters.to) }
    if (filters.truck_id)  { sql += ' AND t.truck_id = ?'; params.push(filters.truck_id) }
    if (filters.driver_id) { sql += ' AND t.driver_id = ?'; params.push(filters.driver_id) }
    if (filters.project_id) { sql += ' AND t.project_id = ?'; params.push(filters.project_id) }
    sql += ' ORDER BY t.date DESC, t.created_at DESC'
    if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit) }
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('trips:getSummary', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = `
      SELECT truck_id, tr.plate,
        SUM(amount) as total_amount,
        SUM(trips_count) as total_trips,
        COUNT(*) as records
      FROM trips t
      LEFT JOIN trucks tr ON t.truck_id = tr.id
      WHERE t.deleted_at IS NULL
    `
    const params: any[] = []
    if (filters.from) { sql += ' AND t.date >= ?'; params.push(filters.from) }
    if (filters.to)   { sql += ' AND t.date <= ?'; params.push(filters.to) }
    sql += ' GROUP BY truck_id ORDER BY total_amount DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('trips:create', (_e, data: any) => {
    const db = getDb()
    const amount = calcAmount(data)

    // Транзакция: добавляем рейс + отмечаем смену водителя
    const insertAll = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO trips
          (date, truck_id, driver_id, shift_type, pricing_mode, trips_count,
           price_per_trip, tons, distance_km, price_per_ton_km, amount, comment, project_id)
        VALUES
          (@date, @truck_id, @driver_id, @shift_type, @pricing_mode, @trips_count,
           @price_per_trip, @tons, @distance_km, @price_per_ton_km, @amount, @comment, @project_id)
      `).run({ ...data, amount, project_id: data.project_id ?? null })

      // Автоматически отмечаем смену как отработанную
      db.prepare(`
        INSERT INTO shifts (date, employee_id, truck_id, shift_type, worked)
        VALUES (@date, @employee_id, @truck_id, @shift_type, 1)
        ON CONFLICT(date, employee_id) DO UPDATE SET
          truck_id=excluded.truck_id, shift_type=excluded.shift_type,
          worked=1, updated_at=datetime('now')
      `).run({
        date: data.date, employee_id: data.driver_id,
        truck_id: data.truck_id, shift_type: data.shift_type
      })

      return result.lastInsertRowid
    })

    const id = insertAll()
    return { ok: true, id }
  })

  ipcMain.handle('trips:update', (_e, id: number, data: any) => {
    const db = getDb()
    const amount = calcAmount(data)
    db.prepare(`
      UPDATE trips SET date=@date, truck_id=@truck_id, driver_id=@driver_id,
        project_id=@project_id,
        shift_type=@shift_type, pricing_mode=@pricing_mode, trips_count=@trips_count,
        price_per_trip=@price_per_trip, tons=@tons, distance_km=@distance_km,
        price_per_ton_km=@price_per_ton_km, amount=@amount, comment=@comment,
        updated_at=datetime('now')
      WHERE id=@id AND deleted_at IS NULL
    `).run({ ...data, amount, id, project_id: data.project_id ?? null })
    return { ok: true }
  })

  ipcMain.handle('trips:remove', (_e, id: number) => {
    const db = getDb()
    db.prepare("UPDATE trips SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })}
