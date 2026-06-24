import { useState, useEffect } from 'react'

const api = () => window.api

interface Org { id: number; name: string; inn?: string; type: string; comment?: string }
interface DictItem { id: number; name: string; category?: string; unit?: string; price_per_unit?: number }

function SimpleList({ title, items, onAdd, onEdit, onDelete, placeholder }: {
  title: string
  items: DictItem[]
  onAdd: (name: string) => void
  onEdit: (id: number, name: string) => void
  onDelete: (id: number) => void
  placeholder: string
}) {
  const [input, setInput]   = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')

  function handleAdd() {
    if (!input.trim()) return
    onAdd(input.trim())
    setInput('')
  }

  function startEdit(item: DictItem) {
    setEditId(item.id); setEditVal(item.name)
  }

  function saveEdit() {
    if (!editVal.trim() || editId === null) return
    onEdit(editId, editVal.trim())
    setEditId(null)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-4 space-y-2">
        {/* Добавить новый */}
        <div className="flex gap-2">
          <input className="input flex-1" placeholder={placeholder} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <button className="btn-primary px-4" onClick={handleAdd}>+ Добавить</button>
        </div>
        {/* Список */}
        <div className="space-y-1 mt-3">
          {items.length === 0 && <p className="text-slate-400 text-sm py-2">Список пуст</p>}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group">
              {editId === item.id ? (
                <>
                  <input className="input flex-1 py-1 text-sm" value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }}
                    autoFocus />
                  <button className="btn-primary text-xs py-1 px-3" onClick={saveEdit}>✓</button>
                  <button className="btn-secondary text-xs py-1 px-3" onClick={() => setEditId(null)}>✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <button onClick={() => startEdit(item)}
                      className="text-slate-400 hover:text-primary-600 text-xs px-1.5 py-0.5 rounded hover:bg-primary-50">✏️</button>
                    <button onClick={() => onDelete(item.id)}
                      className="text-slate-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ItemsList({ categories, units }: { categories: DictItem[]; units: DictItem[] }) {
  const [items, setItems]       = useState<DictItem[]>([])
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState<number | null>(null)
  const [form, setForm]         = useState({ name: '', category: '', unit: 'шт', price_per_unit: '' })

  useEffect(() => { load() }, [search, catFilter])

  async function load() {
    const data = await window.api.dict.items.getAll({ search: search || undefined, category: catFilter || undefined })
    setItems(data)
  }

  function openCreate() {
    setForm({ name: '', category: catFilter || '', unit: 'шт', price_per_unit: '' })
    setEditId(null); setShowForm(true)
  }

  function openEdit(item: DictItem) {
    setForm({ name: item.name, category: item.category || '', unit: item.unit || 'шт', price_per_unit: item.price_per_unit?.toString() || '' })
    setEditId(item.id); setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    const data = { ...form, price_per_unit: parseFloat(form.price_per_unit) || null }
    if (editId) await window.api.dict.items.update(editId, data)
    else await window.api.dict.items.create(data)
    setShowForm(false); setEditId(null); load()
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить наименование из справочника?')) return
    await window.api.dict.items.remove(id); load()
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Наименования</h3>
        <button className="btn-primary text-xs" onClick={openCreate}>+ Добавить</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input w-44" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">Все категории</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {showForm && (
          <div className="bg-slate-50 rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="label">Наименование *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus />
              </div>
              <div>
                <label className="label">Категория</label>
                <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                  <option value="">—</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ед. измерения</label>
                <select className="input" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                  {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Цена по умолчанию, ₽</label>
                <input type="number" className="input" value={form.price_per_unit} onChange={e => setForm({...form, price_per_unit: e.target.value})} placeholder="0" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary text-xs" onClick={() => { setShowForm(false); setEditId(null) }}>Отмена</button>
              <button className="btn-primary text-xs" onClick={handleSave}>{editId ? 'Сохранить' : 'Добавить'}</button>
            </div>
          </div>
        )}

        <div className="space-y-0">
          {items.length === 0
            ? <p className="text-slate-400 text-sm py-4 text-center">Список пуст</p>
            : items.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-slate-50 group border-b border-slate-100 last:border-0">
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-700">{item.name}</span>
                  {item.category && <span className="ml-2 badge badge-gray text-xs">{item.category}</span>}
                </div>
                <span className="text-xs text-slate-400">{item.unit}</span>
                {item.price_per_unit ? <span className="text-xs text-slate-500">{item.price_per_unit.toLocaleString('ru')} ₽</span> : null}
                <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-primary-600 text-xs px-1.5 py-0.5 rounded hover:bg-primary-50">✏️</button>
                  <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

export function DictionariesPage() {
  const [orgItems, setOrgItems]   = useState<Org[]>([])
  const [orgForm, setOrgForm]     = useState({ name: '', inn: '', type: 'both', comment: '' })
  const [orgEditId, setOrgEditId] = useState<number | null>(null)
  const [orgTab, setOrgTab]       = useState(false)

  useEffect(() => { loadOrgs() }, [])

  function loadOrgs() {
    api().organizations.getAll().then(setOrgItems).catch(() => {})
  }

  const [innLoading, setInnLoading] = useState(false)

  async function lookupInn(inn: string) {
    if (!inn || inn.length < 10) return
    setInnLoading(true)
    try {
      // Используем открытый API dadata suggestions (без ключа — через CORS proxy)
      try {
        const r = await api().organizations.lookupInn(inn)
        if (r?.ok && r.name) setOrgForm(f => ({ ...f, name: r.name }))
        else alert('Организация не найдена. Введите название вручную.')
      } catch {}
    } catch {
      // Молча игнорируем — пользователь введёт вручную
    } finally {
      setInnLoading(false)
    }
  }

  async function handleOrgAdd() {
    if (!orgForm.name.trim()) return
    await api().organizations.create(orgForm)
    setOrgForm({ name: '', inn: '', type: 'both', comment: '' })
    loadOrgs()
  }

  async function handleOrgSave() {
    if (!orgEditId || !orgForm.name.trim()) return
    await api().organizations.update(orgEditId, orgForm)
    setOrgEditId(null)
    setOrgForm({ name: '', inn: '', type: 'both', comment: '' })
    loadOrgs()
  }

  function startOrgEdit(o: Org) {
    setOrgEditId(o.id)
    setOrgForm({ name: o.name, inn: o.inn || '', type: o.type, comment: o.comment || '' })
  }

  async function handleOrgDelete(id: number) {
    if (!confirm('Удалить организацию?')) return
    await api().organizations.remove(id)
    loadOrgs()
  }
  const [categories, setCategories] = useState<DictItem[]>([])
  const [units, setUnits]           = useState<DictItem[]>([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [cats, uns] = await Promise.all([
      window.api.dict.categories.getAll(),
      window.api.dict.units.getAll(),
    ])
    setCategories(cats); setUnits(uns)
  }

  async function addCategory(name: string) {
    const r = await window.api.dict.categories.create(name)
    if (r.ok) loadAll()
    else alert(r.error)
  }
  async function editCategory(id: number, name: string) {
    await window.api.dict.categories.update(id, name); loadAll()
  }
  async function deleteCategory(id: number) {
    if (!confirm('Удалить категорию?')) return
    await window.api.dict.categories.remove(id); loadAll()
  }

  async function addUnit(name: string) {
    const r = await window.api.dict.units.create(name)
    if (r.ok) loadAll()
    else alert(r.error)
  }
  async function editUnit(id: number, name: string) {
    await window.api.dict.units.update(id, name); loadAll()
  }
  async function deleteUnit(id: number) {
    if (!confirm('Удалить единицу измерения?')) return
    await window.api.dict.units.remove(id); loadAll()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Справочники</h1>
        <p className="text-sm text-slate-500">Управление категориями, единицами измерения, наименованиями и организациями</p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <SimpleList
          title="Категории расходов"
          items={categories}
          onAdd={addCategory}
          onEdit={editCategory}
          onDelete={deleteCategory}
          placeholder="Новая категория..."
        />
        <SimpleList
          title="Единицы измерения"
          items={units}
          onAdd={addUnit}
          onEdit={editUnit}
          onDelete={deleteUnit}
          placeholder="Новая единица..."
        />
      </div>

      <ItemsList categories={categories} units={units} />

      {/* ─── ОРГАНИЗАЦИИ ─── */}
      <div className="card card-body space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">Организации</h2>
          <span className="text-xs text-slate-400">{orgItems.length} записей</span>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="label">Название *</label>
              <input className="input" placeholder="ООО Ромашка" value={orgForm.name}
                onChange={e => setOrgForm({...orgForm, name: e.target.value})} />
            </div>
            <div>
              <label className="label">ИНН {innLoading && <span className="text-slate-400 text-xs ml-1">🔍 поиск...</span>}</label>
              <input className="input" placeholder="7701234567" value={orgForm.inn}
                onChange={e => setOrgForm({...orgForm, inn: e.target.value})}
                onBlur={e => lookupInn(e.target.value)} />
              {orgForm.inn && !innLoading && (
                <button className="text-xs text-primary-600 hover:underline mt-0.5" onClick={() => lookupInn(orgForm.inn)}>
                  🔍 Найти по ИНН
                </button>
              )}
            </div>
            <div>
              <label className="label">Тип</label>
              <select className="input" value={orgForm.type} onChange={e => setOrgForm({...orgForm, type: e.target.value})}>
                <option value="both">Поставщик и клиент</option>
                <option value="supplier">Поставщик</option>
                <option value="client">Клиент</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            {orgEditId && (
              <button className="btn-ghost text-xs" onClick={() => { setOrgEditId(null); setOrgForm({ name: '', inn: '', type: 'both', comment: '' }) }}>
                Отмена
              </button>
            )}
            <button className="btn-primary text-sm" onClick={orgEditId ? handleOrgSave : handleOrgAdd}>
              {orgEditId ? '✓ Сохранить' : '+ Добавить'}
            </button>
          </div>
        </div>

        {orgItems.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Организаций пока нет</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Название</th><th>ИНН</th><th>Тип</th><th></th></tr>
              </thead>
              <tbody>
                {orgItems.map(o => (
                  <tr key={o.id} className={orgEditId === o.id ? 'bg-primary-50' : ''}>
                    <td className="font-medium">{o.name}</td>
                    <td className="text-sm text-slate-500 font-mono">{o.inn || '—'}</td>
                    <td>
                      <span className="badge badge-gray text-xs">
                        {o.type === 'supplier' ? 'Поставщик' : o.type === 'client' ? 'Клиент' : 'Поставщик и клиент'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startOrgEdit(o)} className="text-slate-400 hover:text-primary-600 text-sm px-1.5 py-0.5 rounded hover:bg-primary-50">✏️</button>
                        <button onClick={() => handleOrgDelete(o.id)} className="text-slate-400 hover:text-red-600 text-sm px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
