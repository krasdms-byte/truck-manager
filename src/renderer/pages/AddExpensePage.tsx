import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { todayISO, formatMoney } from '../utils/format'
import { OrgSelector } from '../components/OrgSelector'

interface Truck    { id: number; plate: string; model?: string }
interface Part     { id: number; name: string; unit: string; qty_in_stock: number; price_per_unit: number; category: string }
interface DictItem { id: number; name: string; category?: string; unit?: string; price_per_unit?: number }

interface ExpenseItem {
  id: number
  sourceType: 'manual' | 'stock'
  partId: string
  name: string
  category: string
  unit: string
  qty: string
  pricePerUnit: string
  comment: string
}

const api = () => window.api

function emptyItem(nextId: number, categories: string[], units: string[]): ExpenseItem {
  return {
    id: nextId,
    sourceType: 'manual',
    partId: '',
    name: '',
    category: categories[0] || '',
    unit: units[0] || 'шт',
    qty: '1',
    pricePerUnit: '',
    comment: '',
  }
}

export function AddExpensePage() {
  const navigate = useNavigate()
  const nextId = useRef(1)
  const [trucks, setTrucks]         = useState<Truck[]>([])
  const [parts, setParts]           = useState<Part[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [units, setUnits]           = useState<string[]>([])
  const [dictItems, setDictItems]   = useState<DictItem[]>([])
  const [projects, setProjects]     = useState<any[]>([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  // Общие поля
  const [date, setDate]           = useState(todayISO())
  const [truckId, setTruckId]     = useState('')
  const [orgId, setOrgId]         = useState('')
  const [orgName, setOrgName]     = useState('')
  const [payStatus, setPayStatus] = useState<'paid' | 'debt'>('paid')
  const [projectId, setProjectId] = useState('')

  // Список позиций
  const [items, setItems] = useState<ExpenseItem[]>([])

  useEffect(() => {
    Promise.all([
      api().trucks.getAll(),
      api().parts.getAll({}),
      api().dict.categories.getAll(),
      api().dict.units.getAll(),
      api().dict.items.getAll({}),
      api().projects.getAll({}),
    ]).then(([t, p, cats, uns, ditems, projs]) => {
      const catNames = (cats as any[]).map((c: any) => c.name)
      const unitNames = (uns as any[]).map((u: any) => u.name)
      setTrucks(t as Truck[])
      setParts(p as Part[])
      setCategories(catNames)
      setUnits(unitNames)
      setDictItems(ditems as DictItem[])
      setProjects(projs as any[])
      setItems([emptyItem(nextId.current++, catNames, unitNames)])
    })
  }, [])

  function updateItem(id: number, patch: Partial<ExpenseItem>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem(nextId.current++, categories, units)])
  }

  function removeItem(id: number) {
    setItems(prev => prev.filter(it => it.id !== id))
  }

  function handlePartSelect(itemId: number, partIdStr: string) {
    if (!partIdStr) {
      updateItem(itemId, { partId: '', name: '', pricePerUnit: '' })
      return
    }
    const part = parts.find(p => String(p.id) === partIdStr)
    if (part) {
      updateItem(itemId, {
        partId: partIdStr,
        name: part.name,
        unit: part.unit,
        pricePerUnit: part.price_per_unit.toString(),
        category: 'Запчасти',
      })
    }
  }

  function handleDictSelect(itemId: number, dictId: string) {
    if (!dictId) return
    const item = dictItems.find(i => String(i.id) === dictId)
    if (!item) return
    updateItem(itemId, {
      name: item.name,
      unit: item.unit || units[0] || 'шт',
      pricePerUnit: item.price_per_unit ? item.price_per_unit.toString() : '',
    })
  }

  const totalAmount = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.pricePerUnit) || 0), 0)

  async function handleSave() {
    if (!truckId) { setError('Выберите технику'); return }
    for (const it of items) {
      if (!it.name.trim()) { setError('Укажите наименование для всех позиций'); return }
      if (!it.pricePerUnit) { setError('Укажите цену для всех позиций'); return }
    }
    setSaving(true); setError('')
    try {
      for (const it of items) {
        const amount = (parseFloat(it.qty) || 0) * (parseFloat(it.pricePerUnit) || 0)
        await api().expenses.create({
          date,
          truck_id: parseInt(truckId),
          category: it.category,
          part_id: it.partId ? parseInt(it.partId) : null,
          name: it.name,
          unit: it.unit,
          qty: parseFloat(it.qty) || 1,
          price_per_unit: parseFloat(it.pricePerUnit) || 0,
          amount,
          comment: it.comment,
          organization_id: orgId ? parseInt(orgId) : null,
          pay_status: payStatus,
          project_id: projectId ? parseInt(projectId) : null,
        })
      }
      navigate('/expenses')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => navigate('/expenses')}>← Назад</button>
        <h1 className="text-xl font-bold text-slate-800">Добавить расход</h1>
      </div>

      {/* Общие поля */}
      <div className="card card-body space-y-4">
        <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Общие данные</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Дата</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Техника *</label>
            <select className="input" value={truckId} onChange={e => setTruckId(e.target.value)}>
              <option value="">— выберите —</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}{t.model ? ` (${t.model})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Проект (необязательно)</label>
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— не привязывать —</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` (${p.client_name})` : ''}</option>)}
            </select>
          </div>
          <div>
            <OrgSelector
              label="Организация / Поставщик"
              value={orgName}
              onChange={(name, id) => { setOrgName(name); setOrgId(id ? String(id) : '') }}
              placeholder="— не указана —"
            />
          </div>
          <div className="col-span-2">
            <label className="label">Статус оплаты</label>
            <div className="flex gap-2">
              <button onClick={() => setPayStatus('paid')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all
                  ${payStatus === 'paid' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                ✓ Оплачено
              </button>
              <button onClick={() => setPayStatus('debt')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all
                  ${payStatus === 'debt' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                ⏳ В долг
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Позиции */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">Позиции <span className="text-slate-400 font-normal text-sm">({items.length})</span></h3>
          <button className="btn-secondary text-sm" onClick={addItem}>+ Добавить позицию</button>
        </div>

        {items.map((it, idx) => {
          const amount = (parseFloat(it.qty) || 0) * (parseFloat(it.pricePerUnit) || 0)
          const selectedPart = parts.find(p => String(p.id) === it.partId)
          const stockWarning = selectedPart && parseFloat(it.qty) > selectedPart.qty_in_stock
          const filteredDict = dictItems.filter(i => !i.category || i.category === it.category)

          return (
            <div key={it.id} className="card card-body space-y-4 border-2 border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Позиция {idx + 1}</span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(it.id)}
                    className="text-slate-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">✕ Удалить</button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Категория</label>
                  <select className="input" value={it.category}
                    onChange={e => updateItem(it.id, { category: e.target.value, partId: '' })}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Источник</label>
                  <div className="flex gap-2">
                    {(['manual', 'stock'] as const).map(s => (
                      <button key={s} onClick={() => updateItem(it.id, { sourceType: s, partId: '', name: '' })}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all
                          ${it.sourceType === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        {s === 'manual' ? '✏️ Вручную' : '📦 Со склада'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Со склада */}
              {it.sourceType === 'stock' && (
                <div>
                  <label className="label">Выбрать со склада</label>
                  <select className="input" value={it.partId} onChange={e => handlePartSelect(it.id, e.target.value)}>
                    <option value="">— выберите позицию —</option>
                    {parts.filter(p => p.qty_in_stock > 0).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.qty_in_stock} {p.unit} · {p.price_per_unit.toLocaleString('ru')} ₽
                      </option>
                    ))}
                  </select>
                  {stockWarning && <p className="text-red-600 text-xs mt-1">⚠️ На складе только {selectedPart?.qty_in_stock} {selectedPart?.unit}</p>}
                </div>
              )}

              {/* Наименование */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Наименование *</label>
                </div>
                <div className="flex gap-2">
                  <input className="input flex-1" value={it.name}
                    onChange={e => updateItem(it.id, { name: e.target.value })}
                    placeholder="Введите наименование..." />
                  {filteredDict.length > 0 && (
                    <select className="input w-52" onChange={e => handleDictSelect(it.id, e.target.value)} value="">
                      <option value="">📚 Из справочника</option>
                      {filteredDict.map(i => (
                        <option key={i.id} value={i.id}>{i.name}{i.price_per_unit ? ` · ${i.price_per_unit.toLocaleString('ru')} ₽` : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="label">Единица</label>
                  <select className="input" value={it.unit} onChange={e => updateItem(it.id, { unit: e.target.value })}>
                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Количество</label>
                  <input type="number" className="input" value={it.qty}
                    onChange={e => updateItem(it.id, { qty: e.target.value })} min="0.01" step="0.01" />
                </div>
                <div>
                  <label className="label">Цена за ед., ₽ *</label>
                  <input type="number" className="input" value={it.pricePerUnit}
                    onChange={e => updateItem(it.id, { pricePerUnit: e.target.value })} />
                </div>
                <div>
                  <label className="label">Итого</label>
                  <div className="input bg-slate-100 font-semibold text-red-600">{formatMoney(amount)}</div>
                </div>
                <div className="col-span-4">
                  <label className="label">Примечание</label>
                  <input className="input" value={it.comment}
                    onChange={e => updateItem(it.id, { comment: e.target.value })} />
                </div>
              </div>
            </div>
          )
        })}

        <button className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-primary-400 hover:text-primary-600 text-sm font-medium transition-colors"
          onClick={addItem}>
          + Добавить ещё позицию
        </button>
      </div>

      {/* Итог и сохранение */}
      <div className="card card-body">
        {payStatus === 'debt' && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-700 mb-4">
            ⚠️ Расход будет отмечен как долг
          </div>
        )}
        {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200 mb-4">{error}</div>}
        <div className="flex justify-between items-center">
          <div>
            <span className="text-sm text-slate-500">Итого: </span>
            <span className="text-2xl font-bold text-red-600">{formatMoney(totalAmount)}</span>
            <span className="text-sm text-slate-400 ml-2">{items.length} поз.</span>
            {payStatus === 'debt' && <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">В долг</span>}
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => navigate('/expenses')}>Отмена</button>
            <button className="btn-primary px-6" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : `✓ Сохранить ${items.length > 1 ? items.length + ' позиции' : 'расход'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
