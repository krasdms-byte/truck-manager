import { useState, useEffect, useCallback } from 'react'

const api = () => window.api

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number
  table_name: string
  record_id: number
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  old_data?: string
  new_data?: string
  changed_at: string
  user_name: string
}

// ─── Вспомогательные ──────────────────────────────────────────────────────────

const TABLE_LABELS: Record<string, string> = {
  income:   'Доходы',
  trips:    'Рейсы',
  expenses: 'Расходы',
  payments: 'Выплаты',
  parts:    'Склад',
  employees:'Сотрудники',
  trucks:   'Самосвалы',
}

const ACTION_META: Record<string, { label: string; cls: string }> = {
  INSERT: { label: 'Создание',  cls: 'bg-green-100 text-green-700' },
  UPDATE: { label: 'Изменение', cls: 'bg-blue-100 text-blue-700'  },
  DELETE: { label: 'Удаление',  cls: 'bg-red-100 text-red-700'    },
}

function formatDateTime(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('+') ? '' : 'Z'))
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Europe/Moscow',
  })
}

function parseJson(s?: string): Record<string, any> | null {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

// Человекочитаемые названия полей
const FIELD_LABELS: Record<string, string> = {
  date: 'Дата', amount: 'Сумма', from_who: 'От кого', comment: 'Примечание',
  truck_id: 'Самосвал ID', driver_id: 'Водитель ID', shift_type: 'Смена',
  pricing_mode: 'Режим', trips_count: 'Рейсов', price_per_trip: 'Цена/рейс',
  tons: 'Тонн', distance_km: 'Км', price_per_ton_km: 'Цена/т·км',
  name: 'Название', category: 'Категория', qty: 'Кол-во', qty_in_stock: 'Остаток',
  price_per_unit: 'Цена', unit: 'Ед.', employee_id: 'Сотрудник ID',
  month: 'Месяц', truck_plate: 'Номер', driver_name: 'Водитель',
}
function fieldLabel(k: string) { return FIELD_LABELS[k] ?? k }

function formatVal(k: string, v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (k === 'amount' || k === 'price_per_trip' || k === 'price_per_unit' || k === 'price_per_ton_km')
    return Number(v).toLocaleString('ru-RU') + ' ₽'
  if (k === 'shift_type') return v === 'day' ? 'День' : 'Ночь'
  if (k === 'pricing_mode') return v === 'per_trip' ? 'За рейс' : 'Тонно-км'
  return String(v)
}

// Рендер diff между old и new JSON
function DiffView({ old_data, new_data, action }: {
  old_data?: string; new_data?: string; action: string
}) {
  const oldObj = parseJson(old_data)
  const newObj = parseJson(new_data)

  if (!oldObj && !newObj) return <span className="text-slate-400 text-xs">—</span>

  if (action === 'DELETE' && oldObj) {
    const entries = Object.entries(oldObj).filter(([,v]) => v !== null && v !== '')
    return (
      <div className="text-xs space-y-0.5">
        {entries.slice(0,3).map(([k, v]) => (
          <div key={k} className="flex gap-1">
            <span className="text-slate-400 shrink-0">{fieldLabel(k)}:</span>
            <span className="text-red-600 line-through">{formatVal(k, v)}</span>
          </div>
        ))}
        {entries.length > 3 && <span className="text-slate-300">+{entries.length-3} полей</span>}
      </div>
    )
  }

  if (action === 'INSERT' && newObj) {
    const entries = Object.entries(newObj).filter(([,v]) => v !== null && v !== '')
    return (
      <div className="text-xs space-y-0.5">
        {entries.slice(0,3).map(([k, v]) => (
          <div key={k} className="flex gap-1">
            <span className="text-slate-400 shrink-0">{fieldLabel(k)}:</span>
            <span className="text-green-700">{formatVal(k, v)}</span>
          </div>
        ))}
        {entries.length > 3 && <span className="text-slate-300">+{entries.length-3} полей</span>}
      </div>
    )
  }

  if (action === 'UPDATE' && oldObj && newObj) {
    const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]))
    const changed = keys.filter(k => String(oldObj[k]) !== String(newObj[k]))
    if (changed.length === 0) return <span className="text-slate-400 text-xs">без изменений</span>
    return (
      <div className="text-xs space-y-0.5">
        {changed.map(k => (
          <div key={k} className="flex gap-1 flex-wrap">
            <span className="text-slate-400 shrink-0">{fieldLabel(k)}:</span>
            <span className="text-red-500 line-through">{formatVal(k, oldObj[k])}</span>
            <span className="text-slate-400">→</span>
            <span className="text-green-700 font-medium">{formatVal(k, newObj[k])}</span>
          </div>
        ))}
      </div>
    )
  }

  return <span className="text-slate-400 text-xs">—</span>
}

// ─── Страница ──────────────────────────────────────────────────────────────────

export function AuditPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([])
  const [tables, setTables]     = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  const [filterTable,  setFilterTable]  = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  useEffect(() => {
    api().audit.getTables().then((r: any) => {
      if (r.ok) setTables(r.data)
    }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api().audit.getLog({
        table_name: filterTable  || undefined,
        action:     filterAction || undefined,
        date_from:  filterFrom   || undefined,
        date_to:    filterTo     || undefined,
        limit: 500,
      })
      if (res.ok) setEntries(res.data)
    } finally {
      setLoading(false)
    }
  }, [filterTable, filterAction, filterFrom, filterTo])

  useEffect(() => { load() }, [load])

  function clearFilters() {
    setFilterTable(''); setFilterAction('')
    setFilterFrom('');  setFilterTo('')
  }

  const hasFilters = filterTable || filterAction || filterFrom || filterTo

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">История изменений</h1>
          <p className="text-sm text-slate-500">
            {loading
              ? 'Загрузка...'
              : `Записей: ${entries.length}${entries.length === 500 ? ' (показаны последние 500)' : ''}`}
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={load}>↻ Обновить</button>
      </div>

      {/* Фильтры */}
      <div className="card card-body">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Раздел</label>
            <select className="input w-40" value={filterTable} onChange={e => setFilterTable(e.target.value)}>
              <option value="">Все разделы</option>
              {tables.map(t => (
                <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Действие</label>
            <select className="input w-36" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
              <option value="">Все</option>
              <option value="INSERT">Создание</option>
              <option value="UPDATE">Изменение</option>
              <option value="DELETE">Удаление</option>
            </select>
          </div>
          <div>
            <label className="label">С даты</label>
            <input type="date" className="input w-40" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">По дату</label>
            <input type="date" className="input w-40" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button className="btn-ghost text-sm self-end" onClick={clearFilters}>
              ✕ Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Таблица */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="w-40">Дата и время</th>
              <th className="w-28">Раздел</th>
              <th className="w-12 text-center">ID</th>
              <th className="w-28">Действие</th>
              <th className="w-24">Пользователь</th>
              <th>Изменения</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">Загрузка...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                {hasFilters ? 'По фильтру записей не найдено' : 'История изменений пуста'}
              </td></tr>
            ) : entries.flatMap(e => {
              const isOpen = expanded === e.id
              const actionMeta = ACTION_META[e.action]
              const rows = [
                <tr
                  key={e.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                >
                  <td className="text-xs text-slate-500 whitespace-nowrap font-mono">
                    {formatDateTime(e.changed_at)}
                  </td>
                  <td>
                    <span className="badge badge-gray text-xs">
                      {TABLE_LABELS[e.table_name] ?? e.table_name}
                    </span>
                  </td>
                  <td className="text-center text-slate-400 text-xs">#{e.record_id}</td>
                  <td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionMeta.cls}`}>
                      {actionMeta.label}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{e.user_name}</td>
                  <td className="max-w-xs">
                    <DiffView old_data={e.old_data} new_data={e.new_data} action={e.action} />
                  </td>
                  <td className="text-slate-300 text-xs select-none">
                    {isOpen ? '▲' : '▼'}
                  </td>
                </tr>
              ]

              if (isOpen) {
                rows.push(
                  <tr key={`${e.id}-detail`} className="bg-slate-50">
                    <td colSpan={7} className="px-4 pb-4 pt-1 bg-slate-50">
                      {(() => {
                        const oldObj = parseJson(e.old_data)
                        const newObj = parseJson(e.new_data)
                        if (e.action === 'UPDATE' && oldObj && newObj) {
                          const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]))
                          const changed = keys.filter(k => String(oldObj[k]) !== String(newObj[k]))
                          const unchanged = keys.filter(k => String(oldObj[k]) === String(newObj[k]))
                          return (
                            <div className="space-y-2">
                              {changed.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Изменённые поля</p>
                                  <div className="bg-white border border-slate-200 rounded overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead><tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left px-3 py-1.5 text-slate-400 font-medium w-32">Поле</th>
                                        <th className="text-left px-3 py-1.5 text-red-400 font-medium">Было</th>
                                        <th className="text-left px-3 py-1.5 text-green-600 font-medium">Стало</th>
                                      </tr></thead>
                                      <tbody>
                                        {changed.map(k => (
                                          <tr key={k} className="border-b border-slate-100 last:border-0">
                                            <td className="px-3 py-1.5 text-slate-500 font-medium">{fieldLabel(k)}</td>
                                            <td className="px-3 py-1.5 text-red-500 line-through">{formatVal(k, oldObj[k])}</td>
                                            <td className="px-3 py-1.5 text-green-700 font-medium">{formatVal(k, newObj[k])}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {unchanged.length > 0 && (
                                <details className="text-xs">
                                  <summary className="text-slate-400 cursor-pointer hover:text-slate-600">Неизменённые поля ({unchanged.length})</summary>
                                  <div className="mt-1 bg-white border border-slate-200 rounded p-2 grid grid-cols-3 gap-x-4 gap-y-0.5">
                                    {unchanged.map(k => (
                                      <div key={k} className="flex gap-1">
                                        <span className="text-slate-400">{fieldLabel(k)}:</span>
                                        <span className="text-slate-600">{formatVal(k, oldObj[k])}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )
                        }
                        const obj = newObj || oldObj
                        if (!obj) return null
                        const entries = Object.entries(obj).filter(([,v]) => v !== null && v !== '')
                        return (
                          <div className="bg-white border border-slate-200 rounded overflow-hidden">
                            <table className="w-full text-xs">
                              <tbody>
                                {entries.map(([k, v]) => (
                                  <tr key={k} className="border-b border-slate-100 last:border-0">
                                    <td className="px-3 py-1.5 text-slate-400 font-medium w-32">{fieldLabel(k)}</td>
                                    <td className={`px-3 py-1.5 font-medium ${e.action === 'DELETE' ? 'text-red-600 line-through' : 'text-green-700'}`}>
                                      {formatVal(k, v)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                )
              }

              return rows
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
