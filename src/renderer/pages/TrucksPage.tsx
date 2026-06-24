import { useState, useEffect } from 'react'

interface Truck {
  id: number; plate: string; model?: string; year?: number
  vehicle_type?: string
  active: number; shifts_total?: number; trips_total?: number; last_project?: string
}
interface Project { id: number; name: string; client_name?: string }

const api = () => window.api

export function TrucksPage() {
  const [items, setItems]         = useState<Truck[]>([])
  const [projects, setProjects]   = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState<number | null>(null)
  const [form, setForm]           = useState({ plate: '', model: '', year: '', vehicle_type: 'Самосвал', active: '1' })

  useEffect(() => {
    api().projects.getAll({}).then(setProjects).catch(() => setProjects([]))
  }, [])

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    try {
      const data = await api().trucks.getAllWithStats(projectId ? parseInt(projectId) : undefined)
      setItems(data)
    } catch (e) {
      console.error('trucks load error:', e)
      setItems([])
    }
    setLoading(false)
  }

  function openCreate() {
    setForm({ plate: '', model: '', year: '', active: '1' }); setEditId(null); setShowForm(true)
  }
  function openEdit(t: Truck) {
    setForm({ plate: t.plate, model: t.model||'', year: t.year?.toString()||'', vehicle_type: t.vehicle_type||'Самосвал', active: t.active.toString() })
    setEditId(t.id); setShowForm(true)
  }
  async function handleSave() {
    if (!form.plate.trim()) return
    const data = { ...form, year: form.year ? parseInt(form.year) : null, active: parseInt(form.active), vehicle_type: form.vehicle_type }
    if (editId) await api().trucks.update(editId, data)
    else await api().trucks.create(data)
    setShowForm(false); load()
  }

  const activeCount = items.filter(t => t.active).length
  const totalTrips  = items.reduce((s, t) => s + (t.trips_total || 0), 0)
  const selectedProject = projects.find(p => String(p.id) === projectId)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Техника</h1>
          <p className="text-sm text-slate-500">
            Активных: <span className="font-semibold text-green-600">{activeCount}</span>
            {' · '}Смен{selectedProject ? ` (${selectedProject.name})` : ' всего'}:{' '}
            <span className="font-semibold text-primary-600">{items.reduce((s,t) => s + (t.shifts_total||0), 0)}</span>
            {' · '}Рейсов:{' '}
            <span className="font-semibold text-primary-600">{totalTrips}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input w-52" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">Все проекты</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` (${p.client_name})` : ''}</option>)}
          </select>
          <button className="btn-primary" onClick={openCreate}>+ Добавить технику</button>
        </div>
      </div>

      {showForm && (
        <div className="card card-body space-y-4 border-2 border-primary-200">
          <h3 className="font-semibold text-slate-700">{editId ? 'Редактировать технику' : 'Новая техника'}</h3>
          <div className="grid grid-cols-5 gap-3">
            <div><label className="label">Гос. номер *</label>
              <input className="input" placeholder="А123ВС777" value={form.plate}
                onChange={e => setForm({...form, plate: e.target.value.toUpperCase()})} autoFocus /></div>
            <div><label className="label">Тип техники</label>
              <select className="input" value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})}>
                <option value="Самосвал">Самосвал</option>
                <option value="КМУ">КМУ</option>
                <option value="Экскаватор">Экскаватор</option>
                <option value="Бульдозер">Бульдозер</option>
                <option value="Автокран">Автокран</option>
                <option value="Прочее">Прочее</option>
              </select></div>
            <div><label className="label">Марка / Модель</label>
              <input className="input" placeholder="КАМАЗ 65115" value={form.model}
                onChange={e => setForm({...form, model: e.target.value})} /></div>
            <div><label className="label">Год выпуска</label>
              <input type="number" className="input" placeholder="2020" value={form.year}
                onChange={e => setForm({...form, year: e.target.value})} /></div>
            <div><label className="label">Статус</label>
              <select className="input" value={form.active} onChange={e => setForm({...form, active: e.target.value})}>
                <option value="1">В парке</option>
                <option value="0">Списан</option>
              </select></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
            <button className="btn-primary" onClick={handleSave}>{editId ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="card card-body text-center py-12">
          <div className="text-4xl mb-3">🚛</div>
          <p className="text-slate-500 font-medium">Самосвалов пока нет</p>
          <button className="btn-primary mt-4" onClick={openCreate}>+ Добавить первый самосвал</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Гос. номер</th><th>Тип</th><th>Марка / Модель</th><th>Год</th>
                <th className="text-center">Смен</th><th className="text-center">Рейсов</th>
                <th>Последний проект</th><th>Статус</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id}>
                  <td className="font-bold text-slate-800 text-base">{t.plate}</td>
                  <td><span className="badge badge-gray text-xs">{t.vehicle_type || 'Самосвал'}</span></td>
                  <td>{t.model || <span className="text-slate-400">—</span>}</td>
                  <td>{t.year || <span className="text-slate-400">—</span>}</td>
                  <td className="text-center">
                    <span className={`font-semibold ${(t.shifts_total||0) > 0 ? 'text-primary-600' : 'text-slate-400'}`}>
                      {t.shifts_total || 0}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`font-semibold ${(t.trips_total||0) > 0 ? 'text-primary-600' : 'text-slate-400'}`}>
                      {t.trips_total || 0}
                    </span>
                  </td>
                  <td className="text-sm text-slate-500">{t.last_project || <span className="text-slate-400">—</span>}</td>
                  <td><span className={`badge ${t.active ? 'badge-green' : 'badge-gray'}`}>{t.active ? '✓ В парке' : 'Списан'}</span></td>
                  <td><button className="btn-ghost text-xs py-1 px-2" onClick={() => openEdit(t)}>✏️ Ред.</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
