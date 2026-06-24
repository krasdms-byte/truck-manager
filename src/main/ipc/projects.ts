import { ipcMain } from 'electron'
import { getDb } from '../database/db'

export function registerProjectsHandlers() {
  ipcMain.handle('projects:getAll', (_e, filters: any = {}) => {
    const db = getDb()
    let sql = 'SELECT * FROM projects WHERE deleted_at IS NULL'
    const params: any[] = []
    if (filters.status) { sql += ' AND status = ?'; params.push(filters.status) }
    sql += ' ORDER BY name'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('projects:getById', (_e, id: number) => {
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
  })

  ipcMain.handle('projects:create', (_e, data: any) => {
    const result = getDb().prepare(`
      INSERT INTO projects (name, client_name, client_org_id, description, status,
        default_pricing_mode, default_price_per_trip, default_price_per_ton_km)
      VALUES (@name, @client_name, @client_org_id, @description, @status,
        @default_pricing_mode, @default_price_per_trip, @default_price_per_ton_km)
    `).run(data)
    return { ok: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('projects:update', (_e, id: number, data: any) => {
    getDb().prepare(`
      UPDATE projects SET name=@name, client_name=@client_name, client_org_id=@client_org_id,
        description=@description, status=@status,
        default_pricing_mode=@default_pricing_mode,
        default_price_per_trip=@default_price_per_trip,
        default_price_per_ton_km=@default_price_per_ton_km,
        updated_at=datetime('now')
      WHERE id=@id AND deleted_at IS NULL
    `).run({ ...data, id })
    return { ok: true }
  })

  ipcMain.handle('projects:remove', (_e, id: number) => {
    getDb().prepare("UPDATE projects SET deleted_at=datetime('now') WHERE id=?").run(id)
    return { ok: true }
  })

  ipcMain.handle('projects:getSummary', (_e, id: number, filters: any = {}) => {
    const db = getDb()
    const params: any[] = [id]
    let df = ''
    if (filters.from) { df += ' AND date >= ?'; params.push(filters.from) }
    if (filters.to)   { df += ' AND date <= ?'; params.push(filters.to) }
    const p2 = [id, ...params.slice(1)]
    const income       = (db.prepare('SELECT COALESCE(SUM(amount),0) as v FROM income   WHERE deleted_at IS NULL AND project_id=?' + df).get(...params) as any).v
    const trips_amount = (db.prepare('SELECT COALESCE(SUM(amount),0) as v FROM trips    WHERE deleted_at IS NULL AND project_id=?' + df).get(...p2) as any).v
    const trips_count  = (db.prepare('SELECT COALESCE(SUM(trips_count),0) as v FROM trips WHERE deleted_at IS NULL AND project_id=?' + df).get(...p2) as any).v
    const trucks       = db.prepare('SELECT DISTINCT t.truck_id, tr.plate, tr.model FROM trips t LEFT JOIN trucks tr ON t.truck_id=tr.id WHERE t.deleted_at IS NULL AND t.project_id=?' + df).all(...p2)
    return { income, trips_amount, trips_count, trucks }
  })

  // ── Сетка тарифов ────────────────────────────────────────────────────────────

  ipcMain.handle('projects:getRateGrid', (_e, projectId: number) => {
    return getDb().prepare(
      'SELECT * FROM project_rate_grid WHERE project_id=? ORDER BY km_from'
    ).all(projectId)
  })

  ipcMain.handle('projects:saveRateGrid', (_e, projectId: number, rows: any[]) => {
    const db = getDb()
    db.prepare('DELETE FROM project_rate_grid WHERE project_id=?').run(projectId)
    const ins = db.prepare(
      'INSERT INTO project_rate_grid (project_id, km_from, km_to, rate, sort_order) VALUES (?,?,?,?,?)'
    )
    rows.forEach((r, i) => ins.run(projectId, r.km_from, r.km_to, r.rate, i))
    return { ok: true }
  })

  ipcMain.handle('projects:getRateForDistance', (_e, projectId: number, km: number) => {
    const row = getDb().prepare(
      'SELECT rate FROM project_rate_grid WHERE project_id=? AND km_from<=? AND km_to>=? ORDER BY km_from LIMIT 1'
    ).get(projectId, km, km) as any
    return row ? row.rate : null
  })

  // ── Самосвалы ─────────────────────────────────────────────────────────────

  ipcMain.handle('trucks:getAll', () => {
    return getDb().prepare('SELECT * FROM trucks WHERE active=1 ORDER BY plate').all()
  })

  ipcMain.handle('trucks:getAllWithStats', (_e, projectId?: number) => {
    const db = getDb()
    const pf = projectId ? 'AND tr.project_id = ' + Number(projectId) : ''
    return db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM trips tr
         WHERE tr.truck_id=t.id AND tr.deleted_at IS NULL ` + pf + `) as shifts_total,
        (SELECT COALESCE(SUM(tr.trips_count),0) FROM trips tr
         WHERE tr.truck_id=t.id AND tr.deleted_at IS NULL ` + pf + `) as trips_total,
        (SELECT p.name FROM projects p
         JOIN trips tr2 ON tr2.project_id=p.id
         WHERE tr2.truck_id=t.id AND tr2.deleted_at IS NULL
         ORDER BY tr2.date DESC LIMIT 1) as last_project
      FROM trucks t ORDER BY t.plate
    `).all()
  })

  ipcMain.handle('trucks:create', (_e, data: any) => {
    const result = getDb().prepare(
      'INSERT INTO trucks (plate, model, year, vehicle_type) VALUES (@plate, @model, @year, @vehicle_type)'
    ).run(data)
    return { ok: true, id: result.lastInsertRowid }
  })

  ipcMain.handle('trucks:update', (_e, id: number, data: any) => {
    getDb().prepare(
      "UPDATE trucks SET plate=@plate, model=@model, year=@year, active=@active, vehicle_type=@vehicle_type, updated_at=datetime('now') WHERE id=@id"
    ).run({ ...data, id })
    return { ok: true }
  })
}
