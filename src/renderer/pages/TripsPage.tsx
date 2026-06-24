import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

async function loadXLSX(): Promise<any> {
  if ((window as any).XLSX) return (window as any).XLSX
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    script.onload = () => resolve((window as any).XLSX)
    script.onerror = reject
    document.head.appendChild(script)
  })
}
import { formatMoney, formatDate, monthStartISO, monthEndISO, currentMonth, PRICING_LABELS } from '../utils/format'
import type { Trip, Truck, Employee } from '../types'

interface Project { id: number; name: string; client_name?: string }

export function TripsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems]         = useState<Trip[]>([])
  const [trucks, setTrucks]       = useState<Truck[]>([])
  const [drivers, setDrivers]     = useState<Employee[]>([])
  const [projects, setProjects]   = useState<Project[]>([])
  const [month, setMonth]         = useState(searchParams.get('month') || currentMonth())
  const [truckId, setTruckId]     = useState('')
  const [projectId, setProjectId] = useState('')
  const [driverId, setDriverId]   = useState('')
  const [loading, setLoading]     = useState(true)
  const [editRow, setEditRow]     = useState<Trip | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage]             = useState(1)
  const [pageSize, setPageSize]     = useState(20)

  useEffect(() => {
    window.api.trucks.getAll().then(setTrucks)
    window.api.employees.getAll({ role: 'driver', active: 1 }).then(setDrivers)
    window.api.projects.getAll({}).then(setProjects)
  }, [])

  useEffect(() => { load() }, [month, truckId, projectId, driverId])

  async function load() {
    setLoading(true)
    const from = monthStartISO(new Date(month + '-01'))
    const to   = monthEndISO(new Date(month + '-01'))
    const data = await window.api.trips.getAll({
      from, to,
      truck_id:   truckId   ? parseInt(truckId)   : undefined,
      project_id: projectId ? parseInt(projectId) : undefined,
      driver_id:  driverId  ? parseInt(driverId)  : undefined,
    })
    setItems(data); setLoading(false); setRefreshKey(k => k + 1); setPage(1)
  }

  async function handleDelete(id: number) {
    const ok = window.confirm('Вы уверены, что хотите удалить эту запись?\nДействие нельзя отменить.')
    if (!ok) return
    await window.api.trips.remove(id)
    load()
  }

  function handleCopy(t: Trip) {
    const copy = {
      ...t,
      id: -1, // признак новой записи
      date: new Date().toISOString().slice(0, 10),
    }
    setEditRow(copy)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleExportExcel() {
    try {
      const XLSX = await loadXLSX()
      const periodLabel = month
      const rows = [
        ['Дата', 'Проект', 'Техника', 'Водитель', 'Смена', 'Режим', 'Рейсов', 'Сумма, ₽', 'Примечание'],
        ...items.map(t => [
          t.date,
          projectName(t.project_id),
          t.truck_plate || '',
          t.driver_name || '',
          t.shift_type === 'day' ? 'День' : 'Ночь',
          t.pricing_mode === 'per_trip' ? 'За рейс' : 'Тонно-км',
          t.trips_count,
          t.amount,
          t.comment || '',
        ]),
        [],
        ['', '', '', '', '', 'ИТОГО смен:', totalShifts, ''],
        ['', '', '', '', '', 'ИТОГО рейсов:', totalTrips, ''],
        ['', '', '', '', '', 'ИТОГО сумма:', total, ''],
      ]
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [12,20,12,25,8,12,8,14,20].map(w => ({ wch: w }))
      // Жирный заголовок
      const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F0FE' } } }
      'ABCDEFGHI'.split('').forEach(col => {
        const cell = ws[col + '1']
        if (cell) cell.s = headerStyle
      })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Рейсы')
      XLSX.writeFile(wb, `рейсы_${periodLabel}.xlsx`)
    } catch (err: any) {
      alert('Ошибка экспорта: ' + err.message)
    }
  }

  function handleExportPDF() {
    const periodLabel = month
    const printContent = `
      <html><head><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
        h1 { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .period { color: #64748b; margin-bottom: 16px; }
        .summary { display: flex; gap: 24px; margin-bottom: 16px; padding: 12px 16px;
          background: #f1f5f9; border-radius: 8px; }
        .summary-item { }
        .summary-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
        .summary-value { font-size: 16px; font-weight: bold; color: #2563eb; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e3a5f; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .amount { text-align: right; font-weight: 600; color: #2563eb; }
        .total-row td { background: #1e3a5f !important; color: white; font-weight: bold; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>Рейсы техники</h1>
      <div class="period">Период: ${periodLabel}</div>
      <div class="summary">
        <div class="summary-item">
          <div class="summary-label">Смен</div>
          <div class="summary-value">${totalShifts}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Рейсов</div>
          <div class="summary-value">${totalTrips}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Сумма</div>
          <div class="summary-value">${total.toLocaleString('ru-RU')} ₽</div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Дата</th><th>Проект</th><th>Техника</th><th>Водитель</th>
          <th>Смена</th><th>Режим</th><th>Рейсов</th><th>Сумма</th>
        </tr></thead>
        <tbody>
          ${items.map(t => `<tr>
            <td>${t.date}</td>
            <td>${projectName(t.project_id)}</td>
            <td>${t.truck_plate || '—'}</td>
            <td>${t.driver_name || '—'}</td>
            <td>${t.shift_type === 'day' ? 'День' : 'Ночь'}</td>
            <td>${t.pricing_mode === 'per_trip' ? 'За рейс' : 'Тонно-км'}</td>
            <td>${t.trips_count}</td>
            <td class="amount">${t.amount.toLocaleString('ru-RU')} ₽</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td colspan="6">ИТОГО</td>
            <td>${totalTrips}</td>
            <td class="amount">${total.toLocaleString('ru-RU')} ₽</td>
          </tr>
        </tbody>
      </table>
      </body></html>
    `
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(printContent)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  async function handleSaveEdit() {
    if (!editRow) return
    const amount = editRow.pricing_mode === 'per_trip'
      ? (editRow.trips_count || 1) * (editRow.price_per_trip || 0)
      : (editRow.tons || 0) * (editRow.distance_km || 0) * (editRow.price_per_ton_km || 0) * (editRow.trips_count || 1)
    if (editRow.id === -1) {
      const { id, truck_plate, driver_name, project_name, ...data } = editRow
      await window.api.trips.create({ ...data, amount, project_id: editRow.project_id ?? null })
    } else {
      await window.api.trips.update(editRow.id, { ...editRow, amount })
    }
    setEditRow(null); load()
  }

  const total       = items.reduce((s, t) => s + t.amount, 0)
  const totalShifts = items.length
  const totalTrips  = items.reduce((s, t) => s + (t.trips_count || 0), 0)
  const totalPages = Math.ceil(items.length / pageSize)
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize)
  const projectName = (id?: number) => projects.find(p => p.id === id)?.name || '—'

  return (
    <div className="space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Рейсы техники</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExportExcel} title="Экспорт в Excel">📊 Excel</button>
          <button className="btn-secondary" onClick={handleExportPDF} title="Печать / PDF">🖨 PDF</button>
          <button className="btn-primary" onClick={() => navigate('/trips/add')}>+ Добавить смену</button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap items-end">
        <input type="month" className="input w-40" value={month} onChange={e => setMonth(e.target.value)} />
        <select className="input w-44" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">Все проекты</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-40" value={truckId} onChange={e => setTruckId(e.target.value)}>
          <option value="">Вся техника</option>
          {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
        </select>
        <select className="input w-48" value={driverId} onChange={e => setDriverId(e.target.value)}>
          <option value="">Все водители</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      </div>

      {/* Сводка */}
      <div className="flex gap-5">
        <div className="card px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Смен</span>
          <span className="text-lg font-bold text-slate-700">{totalShifts}</span>
        </div>
        <div className="card px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Рейсов</span>
          <span className="text-lg font-bold text-slate-700">{totalTrips}</span>
        </div>
        <div className="card px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-slate-400 uppercase tracking-wide">Сумма</span>
          <span className="text-lg font-bold text-primary-600">{formatMoney(total)}</span>
        </div>
      </div>

      {/* Форма редактирования */}
      {editRow && (
        <div className="card card-body space-y-4 border-2 border-primary-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">{editRow.id === -1 ? '📋 Копия рейса — проверьте данные' : `Редактировать рейс #${editRow.id}`}</h3>
            <button className="btn-ghost text-xs" onClick={() => setEditRow(null)}>✕ Закрыть</button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Дата</label>
              <input type="date" className="input" value={editRow.date}
                onChange={e => setEditRow({...editRow, date: e.target.value})} />
            </div>
            <div>
              <label className="label">Проект</label>
              <select className="input" value={editRow.project_id ?? ''}
                onChange={e => setEditRow({...editRow, project_id: e.target.value ? parseInt(e.target.value) : undefined})}>
                <option value="">— нет —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Техника</label>
              <select className="input" value={editRow.truck_id}
                onChange={e => setEditRow({...editRow, truck_id: parseInt(e.target.value)})}>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Водитель</label>
              <select className="input" value={editRow.driver_id}
                onChange={e => setEditRow({...editRow, driver_id: parseInt(e.target.value)})}>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Смена</label>
              <select className="input" value={editRow.shift_type}
                onChange={e => setEditRow({...editRow, shift_type: e.target.value as 'day' | 'night'})}>
                <option value="day">☀️ Дневная</option>
                <option value="night">🌙 Ночная</option>
              </select>
            </div>
            <div>
              <label className="label">Режим</label>
              <select className="input" value={editRow.pricing_mode}
                onChange={e => setEditRow({...editRow, pricing_mode: e.target.value as 'per_trip' | 'per_ton_km'})}>
                <option value="per_trip">За рейс</option>
                <option value="per_ton_km">За тонно-км</option>
              </select>
            </div>
            <div>
              <label className="label">Кол-во рейсов</label>
              <input type="number" className="input" value={editRow.trips_count}
                onChange={e => setEditRow({...editRow, trips_count: parseInt(e.target.value) || 1})} />
            </div>
            {editRow.pricing_mode === 'per_trip' ? (
              <div>
                <label className="label">Цена за рейс, ₽</label>
                <input type="number" className="input" value={editRow.price_per_trip || ''}
                  onChange={e => setEditRow({...editRow, price_per_trip: parseFloat(e.target.value) || 0})} />
              </div>
            ) : (
              <>
                <div>
                  <label className="label">Тонн</label>
                  <input type="number" className="input" value={editRow.tons || ''}
                    onChange={e => setEditRow({...editRow, tons: parseFloat(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="label">Км</label>
                  <input type="number" className="input" value={editRow.distance_km || ''}
                    onChange={e => setEditRow({...editRow, distance_km: parseFloat(e.target.value) || 0})} />
                </div>
                <div>
                  <label className="label">₽/т·км</label>
                  <input type="number" className="input" value={editRow.price_per_ton_km || ''}
                    onChange={e => setEditRow({...editRow, price_per_ton_km: parseFloat(e.target.value) || 0})} />
                </div>
              </>
            )}
            <div className="col-span-4">
              <label className="label">Примечание</label>
              <input className="input" value={editRow.comment || ''}
                onChange={e => setEditRow({...editRow, comment: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEditRow(null)}>Отмена</button>
            <button className="btn-primary" onClick={handleSaveEdit}>✓ Сохранить изменения</button>
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="table-wrap">
        <table className="table" key={refreshKey}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Проект</th>
              <th>Техника</th>
              <th>Водитель</th>
              <th>Смена</th>
              <th>Режим</th>
              <th className="text-center">Рейсов</th>
              <th className="text-right">Сумма</th>
              <th>Примечание</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
              : items.length === 0
                ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Нет рейсов за период</td></tr>
                : pagedItems.map(t => (
                  <tr key={t.id} className={editRow?.id === t.id ? 'bg-primary-50' : ''}>
                    <td className="whitespace-nowrap">{formatDate(t.date)}</td>
                    <td>
                      {t.project_id
                        ? <span className="badge badge-blue">{projectName(t.project_id)}</span>
                        : <span className="text-slate-400 text-xs">—</span>
                      }
                    </td>
                    <td className="font-medium">{t.truck_plate}</td>
                    <td className="text-sm">{t.driver_name}</td>
                    <td>
                      <span className={`badge ${t.shift_type === 'day' ? 'badge-yellow' : 'badge-blue'}`}>
                        {t.shift_type === 'day' ? '☀️ День' : '🌙 Ночь'}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500">{PRICING_LABELS[t.pricing_mode]}</td>
                    <td className="text-center font-medium">{t.trips_count}</td>
                    <td className="text-right font-semibold text-primary-600 whitespace-nowrap">{formatMoney(t.amount)}</td>
                    <td className="text-xs text-slate-400 max-w-32 truncate">{t.comment || '—'}</td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleCopy(t)}
                          className="text-slate-400 hover:text-green-600 text-sm px-1.5 py-0.5 rounded hover:bg-green-50"
                          title="Скопировать рейс">📋</button>
                        <button
                          onClick={() => setEditRow(editRow?.id === t.id ? null : t)}
                          className="text-slate-400 hover:text-primary-600 text-sm px-1.5 py-0.5 rounded hover:bg-primary-50"
                          title="Редактировать">✏️</button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-slate-400 hover:text-red-600 text-sm px-1.5 py-0.5 rounded hover:bg-red-50"
                          title="Удалить">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* Пагинация */}
      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500 px-1">
          <div className="flex items-center gap-3">
            <span>Записей: {items.length} · Показано {(page-1)*pageSize+1}–{Math.min(page*pageSize, items.length)}</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">По</span>
              {[10, 20, 30, 50].map(n => (
                <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
                  className={`px-2 py-0.5 rounded border text-xs font-medium transition-colors ${pageSize === n ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">←</button>
              {Array.from({length: totalPages}, (_, i) => i+1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-2.5 py-1 rounded border text-sm font-medium transition-colors ${page === p ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">→</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
