import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { todayISO } from '../utils/format'
import type { Truck, Employee } from '../types'

interface TripRow {
  pricing_mode: 'per_trip' | 'per_ton_km'
  trips_count: number
  price_per_trip: string
  tons: string
  distance_km: string
  price_per_ton_km: string
  price_per_ton_km_auto: boolean  // true = подставлена из сетки (подсвечиваем)
  comment: string
}

function calcRowAmount(row: TripRow): number {
  if (row.pricing_mode === 'per_trip') {
    return row.trips_count * parseFloat(row.price_per_trip || '0')
  } else {
    return parseFloat(row.tons || '0') * parseFloat(row.distance_km || '0') *
           parseFloat(row.price_per_ton_km || '0') * row.trips_count
  }
}

function emptyRow(mode: 'per_trip' | 'per_ton_km'): TripRow {
  return { pricing_mode: mode, trips_count: 1, price_per_trip: '', tons: '', distance_km: '', price_per_ton_km: '', price_per_ton_km_auto: false, comment: '' }
}

export function AddTripPage() {
  const navigate = useNavigate()
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [drivers, setDrivers]   = useState<Employee[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const [date, setDate]           = useState(todayISO())
  const [projectId, setProjectId] = useState('')
  const [truckId, setTruckId]     = useState('')
  const [driverId, setDriverId]   = useState('')
  const [shiftType, setShiftType] = useState<'day'|'night'>('day')
  const [mode, setMode]           = useState<'per_trip'|'per_ton_km'>('per_trip')
  const [rows, setRows]           = useState<TripRow[]>([emptyRow('per_trip')])

  useEffect(() => {
    Promise.all([
      window.api.trucks.getAll(),
      window.api.employees.getAll({ role: 'driver', active: 1 }),
      window.api.projects.getAll({ status: 'active' }),
    ]).then(([t, d, p]) => {
      setTrucks(t)
      setDrivers(d)
      setProjects(p || [])
    })
  }, [])

  // При смене проекта — подставляем дефолтные ставки
  function handleProjectChange(id: string) {
    setProjectId(id)
    if (!id) return
    const project = projects.find((p: any) => String(p.id) === id)
    if (!project) return
    const newMode = project.default_pricing_mode || mode
    setMode(newMode)
    setRows([{
      ...emptyRow(newMode),
      price_per_trip: project.default_price_per_trip?.toString() || '',
      price_per_ton_km: project.default_price_per_ton_km?.toString() || '',
    }])
  }

  // При смене режима пересоздаём строки
  function handleModeChange(m: 'per_trip'|'per_ton_km') {
    setMode(m)
    setRows([emptyRow(m)])
  }

  // При смене техники — автоподставляем водителя и последний проект
  async function handleTruckChange(id: string) {
    setTruckId(id)
    if (!id) return
    const truck = trucks.find(t => String(t.id) === id)
    if (!truck) return
    // Подставить привязанного водителя
    const driver = drivers.find(d => d.truck_id === truck.id)
    if (driver) setDriverId(String(driver.id))
    // Подставить последний проект этой техники в текущем месяце
    try {
      const month = date.slice(0, 7)
      const from = month + '-01'
      const to = month + '-31'
      const recentTrips = await window.api.trips.getAll({ from, to, truck_id: parseInt(id) })
      if (recentTrips?.length > 0) {
        const lastTrip = recentTrips[0]
        if (lastTrip.project_id) {
          handleProjectChange(String(lastTrip.project_id))
        }
      }
    } catch {}
  }

  function updateRow(i: number, patch: Partial<TripRow>) {
    // Если пользователь вручную правит ставку — снимаем флаг авто
    if ('price_per_ton_km' in patch) {
      patch = { ...patch, price_per_ton_km_auto: false }
    }
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

    // Если изменилось расстояние — ищем ставку в сетке
    if ('distance_km' in patch && projectId && patch.distance_km) {
      const km = parseFloat(patch.distance_km as string)
      if (!isNaN(km) && km > 0) {
        window.api.projects.getRateForDistance(parseInt(projectId), km)
          .then((rate: number | null) => {
            if (rate !== null) {
              setRows(prev => prev.map((r, idx) =>
                idx === i ? { ...r, price_per_ton_km: String(rate), price_per_ton_km_auto: true } : r
              ))
            }
          })
          .catch(() => {})
      } else if (patch.distance_km === '' || parseFloat(patch.distance_km as string) === 0) {
        // Расстояние очищено — сбрасываем автоставку
        setRows(prev => prev.map((r, idx) =>
          idx === i && r.price_per_ton_km_auto ? { ...r, price_per_ton_km: '', price_per_ton_km_auto: false } : r
        ))
      }
    }
  }

  function addRow() {
    setRows([...rows, emptyRow(mode)])
  }

  function removeRow(i: number) {
    if (rows.length === 1) return
    setRows(rows.filter((_, idx) => idx !== i))
  }

  const totalAmount = rows.reduce((s, r) => s + calcRowAmount(r), 0)

  async function handleSave() {
    if (!truckId || !driverId) { setError('Выберите технику и водителя'); return }
    setSaving(true); setError('')
    try {
      for (const row of rows) {
        await window.api.trips.create({
          date, truck_id: parseInt(truckId), driver_id: parseInt(driverId),
          project_id: projectId ? parseInt(projectId) : null,
          shift_type: shiftType, pricing_mode: row.pricing_mode,
          trips_count: row.trips_count,
          price_per_trip: row.pricing_mode === 'per_trip' ? parseFloat(row.price_per_trip || '0') : undefined,
          tons:             row.pricing_mode === 'per_ton_km' ? parseFloat(row.tons || '0') : undefined,
          distance_km:      row.pricing_mode === 'per_ton_km' ? parseFloat(row.distance_km || '0') : undefined,
          price_per_ton_km: row.pricing_mode === 'per_ton_km' ? parseFloat(row.price_per_ton_km || '0') : undefined,
          comment: row.comment,
        })
      }
      navigate(`/trips?month=${date.slice(0, 7)}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => navigate('/trips')}>← Назад</button>
        <h1 className="text-xl font-bold text-slate-800">Добавить смену</h1>
      </div>

      {/* Параметры смены */}
      <div className="card card-body space-y-4">
        <h2 className="font-semibold text-slate-700">Параметры смены</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Дата</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Тип смены</label>
            <div className="flex gap-2">
              {(['day', 'night'] as const).map(s => (
                <button key={s} onClick={() => setShiftType(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${shiftType === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {s === 'day' ? '☀️ Дневная' : '🌙 Ночная'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Техника</label>
            <select className="input" value={truckId} onChange={e => handleTruckChange(e.target.value)}>
              <option value="">— выберите —</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.plate} {t.model ? `(${t.model})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Водитель</label>
            <select className="input" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">— выберите —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Проект</label>
            <select className="input" value={projectId} onChange={e => handleProjectChange(e.target.value)}>
              <option value="">— без проекта —</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` (${p.client_name})` : ''}</option>)}
            </select>
          </div>
        </div>

        {/* Режим расчёта */}
        <div>
          <label className="label">Режим расчёта</label>
          <div className="flex gap-2">
            {(['per_trip', 'per_ton_km'] as const).map(m => (
              <button key={m} onClick={() => handleModeChange(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${mode === m ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {m === 'per_trip' ? '🚛 За рейс' : '📏 За тонно-км'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Строки рейсов */}
      <div className="card card-body space-y-3">
        <h2 className="font-semibold text-slate-700">Рейсы</h2>
        {rows.map((row, i) => (
          <div key={i} className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase">Строка {i + 1}</span>
              {rows.length > 1 && (
                <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-xs">Удалить</button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="label">Кол-во рейсов</label>
                <input type="number" min="1" className="input" value={row.trips_count}
                  onChange={e => updateRow(i, { trips_count: parseInt(e.target.value) || 1 })} />
              </div>
              {mode === 'per_trip' ? (
                <div>
                  <label className="label">Цена за рейс, ₽</label>
                  <input type="number" className="input" value={row.price_per_trip}
                    onChange={e => updateRow(i, { price_per_trip: e.target.value })} />
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Тонн за рейс</label>
                    <input type="number" className="input" value={row.tons}
                      onChange={e => updateRow(i, { tons: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Расстояние, км</label>
                    <input type="number" className="input" value={row.distance_km}
                      onChange={e => updateRow(i, { distance_km: e.target.value })} />
                  </div>
                  <div>
                    <label className="label flex items-center gap-1">
                      Ставка, ₽/т·км
                      {row.price_per_ton_km_auto && (
                        <span className="text-xs text-green-600 font-normal">✓ из сетки</span>
                      )}
                    </label>
                    <input type="number" className={`input ${row.price_per_ton_km_auto ? 'border-green-400 bg-green-50' : ''}`}
                      value={row.price_per_ton_km}
                      onChange={e => updateRow(i, { price_per_ton_km: e.target.value })} />
                  </div>
                </>
              )}
              <div>
                <label className="label">Итого</label>
                <div className="input bg-slate-100 font-semibold text-primary-600">
                  {new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(calcRowAmount(row))} ₽
                </div>
              </div>
            </div>
            <div>
              <label className="label">Примечание</label>
              <input className="input" value={row.comment}
                onChange={e => updateRow(i, { comment: e.target.value })} />
            </div>
          </div>
        ))}

        <button className="btn-secondary w-full" onClick={addRow}>
          + Добавить строку (другое расстояние / ставка)
        </button>
      </div>

      {/* Итого и сохранение */}
      <div className="card card-body flex items-center justify-between">
        <div>
          <span className="text-sm text-slate-500">Итого за смену: </span>
          <span className="text-xl font-bold text-primary-600">
            {new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(totalAmount)} ₽
          </span>
        </div>
        <div className="flex gap-3 items-center">
          {error && <span className="text-red-600 text-sm">{error}</span>}
          <button className="btn-secondary" onClick={() => navigate('/trips')}>Отмена</button>
          <button className="btn-primary px-6" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : '✓ Сохранить смену'}
          </button>
        </div>
      </div>
    </div>
  )
}
