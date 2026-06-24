import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrgSelector } from '../components/OrgSelector'

interface Project {
  id: number
  name: string
  client_name?: string
  client_org_id?: number
  description?: string
  status: 'active' | 'paused' | 'done'
  default_pricing_mode?: string
  default_price_per_trip?: number
  default_price_per_ton_km?: number
}

interface RateGridRow {
  km_from: string
  km_to: string
  rate: string
}

function emptyGridRow(): RateGridRow {
  return { km_from: '', km_to: '', rate: '' }
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Активен',    cls: 'badge-green' },
  paused: { label: 'Пауза',      cls: 'badge-yellow' },
  done:   { label: 'Завершён',   cls: 'badge-gray' },
}

const emptyForm = {
  name: '', client_name: '', client_org_id: null as number | null,
  description: '', status: 'active',
  default_pricing_mode: 'per_trip',
  default_price_per_trip: '', default_price_per_ton_km: '',
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const [items, setItems]       = useState<Project[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState<number | null>(null)
  const [form, setForm]         = useState({ ...emptyForm })
  const [filterStatus, setFilterStatus] = useState('')
  const [rateGrid, setRateGrid]         = useState<RateGridRow[]>([])
  useEffect(() => { load() }, [filterStatus])

  async function load() {
    setLoading(true)
    const data = await window.api.projects.getAll(
      filterStatus ? { status: filterStatus } : {}
    )
    setItems(data)
    setLoading(false)
  }

  function openCreate() {
    setForm({ ...emptyForm })
    setRateGrid([])
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(p: Project) {
    setForm({
      name: p.name,
      client_name: p.client_name || '',
      client_org_id: p.client_org_id || null,
      description: p.description || '',
      status: p.status,
      default_pricing_mode: p.default_pricing_mode || 'per_trip',
      default_price_per_trip: p.default_price_per_trip?.toString() || '',
      default_price_per_ton_km: p.default_price_per_ton_km?.toString() || '',
    })
    setEditId(p.id)
    setShowForm(true)
    // Загружаем сетку тарифов
    ;window.api.projects.getRateGrid(p.id).then((rows: any[]) => {
      setRateGrid(rows.map(r => ({ km_from: String(r.km_from), km_to: String(r.km_to), rate: String(r.rate) })))
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    const data = {
      ...form,
      default_price_per_trip: form.default_price_per_trip ? parseFloat(form.default_price_per_trip) : null,
      default_price_per_ton_km: form.default_price_per_ton_km ? parseFloat(form.default_price_per_ton_km) : null,
    }
    let pid: number
    if (editId) {
      await window.api.projects.update(editId, data)
      pid = editId
    } else {
      const res = await window.api.projects.create(data)
      pid = res.id
    }
    // Сохраняем сетку тарифов
    const validGrid = rateGrid.filter(r => r.km_from && r.km_to && r.rate).map(r => ({
      km_from: parseFloat(r.km_from),
      km_to: parseFloat(r.km_to),
      rate: parseFloat(r.rate),
    }))
    await window.api.projects.saveRateGrid(pid, validGrid)
    setShowForm(false)
    load()
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить проект? Рейсы и поступления останутся в базе.')) return
    await window.api.projects.remove(id)
    load()
  }

  const activeCount = items.filter(p => p.status === 'active').length

  return (
    <div className="space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Проекты / Клиенты</h1>
          <p className="text-sm text-slate-500">
            Активных: <span className="font-semibold text-green-600">{activeCount}</span>
            {' · '}Всего: <span className="font-semibold">{items.length}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="paused">Пауза</option>
            <option value="done">Завершённые</option>
          </select>
          <button className="btn-primary" onClick={openCreate}>+ Новый проект</button>
        </div>
      </div>

      {/* Форма */}
      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="font-semibold text-slate-700">
            {editId ? 'Редактировать проект' : 'Новый проект'}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Название проекта *</label>
              <input className="input" placeholder="Карьер Ивановка" value={form.name}
                onChange={e => setForm({...form, name: e.target.value})} autoFocus />
            </div>
            <div>
              <OrgSelector
                label="Заказчик / Клиент"
                value={form.client_name}
                onChange={(name, orgId) => setForm({...form, client_name: name, client_org_id: orgId ?? null})}
                placeholder="— не указан —"
              />
            </div>
            <div>
              <label className="label">Статус</label>
              <select className="input" value={form.status}
                onChange={e => setForm({...form, status: e.target.value})}>
                <option value="active">Активен</option>
                <option value="paused">Пауза</option>
                <option value="done">Завершён</option>
              </select>
            </div>
            <div className="col-span-3">
              <label className="label">Описание / Адрес объекта</label>
              <input className="input" placeholder="Адрес, материал, особенности..." value={form.description}
                onChange={e => setForm({...form, description: e.target.value})} />
            </div>
          </div>

          {/* Дефолтные ставки */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Ставки по умолчанию (подставляются при добавлении рейса)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Режим расчёта</label>
                <select className="input" value={form.default_pricing_mode}
                  onChange={e => setForm({...form, default_pricing_mode: e.target.value})}>
                  <option value="per_trip">За рейс</option>
                  <option value="per_ton_km">За тонно-км</option>
                </select>
              </div>
              {form.default_pricing_mode === 'per_trip' ? (
                <div>
                  <label className="label">Цена за рейс, ₽</label>
                  <input type="number" className="input" placeholder="0" value={form.default_price_per_trip}
                    onChange={e => setForm({...form, default_price_per_trip: e.target.value})} />
                </div>
              ) : (
                <div>
                  <label className="label">Ставка ₽/т·км (по умолчанию, если нет сетки)</label>
                  <input type="number" className="input" placeholder="0" value={form.default_price_per_ton_km}
                    onChange={e => setForm({...form, default_price_per_ton_km: e.target.value})} />
                </div>
              )}
            </div>

            {/* Сетка тарифов по расстоянию */}
            {form.default_pricing_mode === 'per_ton_km' && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Сетка тарифов по расстоянию
                  </p>
                  <button type="button" className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                    onClick={() => setRateGrid([...rateGrid, emptyGridRow()])}>
                    + Добавить диапазон
                  </button>
                </div>
                {rateGrid.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Сетка не задана — будет использоваться ставка по умолчанию</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2">
                      <span className="text-xs text-slate-400 font-medium">От, км</span>
                      <span className="text-xs text-slate-400 font-medium">До, км</span>
                      <span className="text-xs text-slate-400 font-medium">Ставка, ₽/т·км</span>
                      <span></span>
                    </div>
                    {rateGrid.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 items-center">
                        <input type="number" className="input text-sm" placeholder="0" value={row.km_from}
                          onChange={e => setRateGrid(rateGrid.map((r, j) => j === i ? {...r, km_from: e.target.value} : r))} />
                        <input type="number" className="input text-sm" placeholder="0" value={row.km_to}
                          onChange={e => setRateGrid(rateGrid.map((r, j) => j === i ? {...r, km_to: e.target.value} : r))} />
                        <input type="number" className="input text-sm" placeholder="0.00" step="0.01" value={row.rate}
                          onChange={e => setRateGrid(rateGrid.map((r, j) => j === i ? {...r, rate: e.target.value} : r))} />
                        <button type="button" className="text-red-400 hover:text-red-600 text-lg leading-none"
                          onClick={() => setRateGrid(rateGrid.filter((_, j) => j !== i))}>×</button>
                      </div>
                    ))}
                    <p className="text-xs text-slate-400 mt-1">
                      💡 При добавлении рейса ставка подставится автоматически по расстоянию
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
            <button className="btn-primary" onClick={handleSave}>
              {editId ? 'Сохранить' : 'Создать проект'}
            </button>
          </div>
        </div>
      )}

      {/* Карточки проектов */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="card card-body text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-slate-500 font-medium">Проектов пока нет</p>
          <p className="text-slate-400 text-sm mt-1">Создайте первый проект чтобы привязывать к нему рейсы</p>
          <button className="btn-primary mt-4" onClick={openCreate}>+ Создать проект</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {items.map(p => (
            <div key={p.id} className="card p-5 hover:border-primary-300 transition-colors cursor-pointer"
              onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-slate-800">{p.name}</h3>
                  {p.client_name && (
                    <p className="text-sm text-slate-500">{p.client_name}</p>
                  )}
                </div>
                <span className={`badge ${STATUS_LABELS[p.status].cls}`}>
                  {STATUS_LABELS[p.status].label}
                </span>
              </div>
              {p.description && (
                <p className="text-xs text-slate-400 mb-3 line-clamp-1">{p.description}</p>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-400">
                  {p.default_pricing_mode === 'per_trip'
                    ? `За рейс: ${p.default_price_per_trip ? `${p.default_price_per_trip.toLocaleString('ru')} ₽` : 'не задано'}`
                    : `Тонно-км: ${p.default_price_per_ton_km ? `${p.default_price_per_ton_km} ₽` : 'не задано'}`
                  }
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button className="btn-ghost text-xs py-1 px-2" onClick={() => openEdit(p)}>✏️ Ред.</button>
                  <button className="text-red-400 hover:text-red-600 text-xs px-2"
                    onClick={() => handleDelete(p.id)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
