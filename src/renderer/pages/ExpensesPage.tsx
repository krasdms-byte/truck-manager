import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { OrgSelector } from '../components/OrgSelector'
import { formatMoney, formatDate, monthStartISO, monthEndISO, currentMonth } from '../utils/format'

function yearStartISO() {
  return new Date().getFullYear() + '-01-01'
}
function todayISO2() {
  return new Date().toISOString().slice(0, 10)
}

interface Expense {
  id: number; date: string; truck_id: number; truck_plate?: string
  category: string; part_id?: number; part_name?: string
  name: string; unit?: string; qty: number; price_per_unit: number; amount: number; comment?: string
  organization_id?: number; org_name?: string; pay_status?: 'paid' | 'debt'; project_id?: number; project_name?: string
  debt_closed_at?: string
}
interface Truck { id: number; plate: string }

const CATEGORIES = ['ТО', 'ГСМ', 'Запчасть', 'Шины', 'Страховка', 'Штраф', 'Прочее']

export function ExpensesPage() {
  const navigate = useNavigate()
  const [items, setItems]       = useState<Expense[]>([])
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [dateFrom, setDateFrom] = useState(yearStartISO())
  const [dateTo, setDateTo]     = useState(todayISO2())
  const [truckId, setTruckId]   = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading]   = useState(true)
  const [editRow, setEditRow]   = useState<Expense | null>(null)
  const [showDebtsOnly, setShowDebtsOnly] = useState(false)
  const [projects, setProjects]   = useState<any[]>([])

  useEffect(() => {
    window.api.trucks.getAll().then(setTrucks)
    ;window.api.projects.getAll({}).then(setProjects)
  }, [])
  useEffect(() => { load() }, [dateFrom, dateTo, truckId, category])

  async function load() {
    setLoading(true)
    const data = await window.api.expenses.getAll({ from: dateFrom, to: dateTo, truck_id: truckId ? parseInt(truckId) : undefined, category: category || undefined })
    setItems(data); setLoading(false)
  }

  function handleCopy(e: Expense) {
    const copy = { ...e, id: -1, date: new Date().toISOString().slice(0, 10) }
    setEditRow(copy as any)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить запись о расходе?\nДействие нельзя отменить.')) return
    await window.api.expenses.remove(id); load()
  }

  async function handleSaveEdit() {
    if (!editRow) return
    const amount = (editRow.qty || 1) * (editRow.price_per_unit || 0)
    if ((editRow as any).id === -1) {
      const { id, truck_plate, part_name, org_name, ...data } = editRow as any
      await window.api.expenses.create({ ...data, amount })
    } else {
      await window.api.expenses.update(editRow.id, { ...editRow, amount })
    }
    setEditRow(null); load()
  }

  const displayItems = showDebtsOnly ? items.filter(e => e.pay_status === 'debt' && !e.debt_closed_at) : items
  const total = displayItems.reduce((s, e) => s + e.amount, 0)
  const totalDebt = items.filter(e => e.pay_status === 'debt' && !e.debt_closed_at).reduce((s, e) => s + e.amount, 0)

  // Итоги по категориям
  const byCategory = CATEGORIES.map(cat => ({
    cat, total: items.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
  })).filter(x => x.total > 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Расходы на технику</h1>
          <p className="text-sm text-slate-500">
            Итого: <span className="font-semibold text-red-600">{formatMoney(total)}</span>
            {totalDebt > 0 && <span className="ml-3 text-orange-600 font-semibold">⏳ Долг: {formatMoney(totalDebt)}</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1">
            <input type="date" className="input w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="text-slate-400 text-sm">—</span>
            <input type="date" className="input w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <select className="input w-40" value={truckId} onChange={e => setTruckId(e.target.value)}>
            <option value="">Вся техника</option>
            {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
          </select>
          <select className="input w-36" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Все категории</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowDebtsOnly(!showDebtsOnly)}
            className={`btn-secondary ${showDebtsOnly ? 'bg-orange-100 border-orange-300 text-orange-700' : ''}`}>
            ⏳ {showDebtsOnly ? 'Все расходы' : 'Только долги'}
          </button>
          <button className="btn-primary" onClick={() => navigate('/expenses/add')}>+ Добавить расход</button>
        </div>
      </div>

      {/* Итоги по категориям */}
      {byCategory.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {byCategory.map(({ cat, total }) => (
            <div key={cat} className="bg-white border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">{cat}</span>
              <span className="text-sm font-semibold text-red-600">{formatMoney(total)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Форма редактирования */}
      {editRow && (
        <div className="card card-body space-y-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">{(editRow as any).id === -1 ? '📋 Копия расхода — проверьте данные' : `Редактировать расход #${editRow.id}`}</h3>
            <button className="btn-ghost text-xs" onClick={() => setEditRow(null)}>✕ Закрыть</button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Дата</label>
              <input type="date" className="input" value={editRow.date} onChange={e => setEditRow({...editRow, date: e.target.value})} />
            </div>
            <div>
              <label className="label">Техника</label>
              <select className="input" value={editRow.truck_id} onChange={e => setEditRow({...editRow, truck_id: parseInt(e.target.value)})}>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Категория</label>
              <select className="input" value={editRow.category} onChange={e => setEditRow({...editRow, category: e.target.value})}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Наименование</label>
              <input className="input" value={editRow.name} onChange={e => setEditRow({...editRow, name: e.target.value})} />
            </div>
            <div>
              <label className="label">Количество</label>
              <input type="number" className="input" value={editRow.qty} onChange={e => setEditRow({...editRow, qty: parseFloat(e.target.value) || 1})} />
            </div>
            <div>
              <label className="label">Цена за ед., ₽</label>
              <input type="number" className="input" value={editRow.price_per_unit} onChange={e => setEditRow({...editRow, price_per_unit: parseFloat(e.target.value) || 0})} />
            </div>
            <div>
              <label className="label">Итого</label>
              <div className="input bg-slate-100 font-semibold text-red-600">
                {formatMoney((editRow.qty || 1) * (editRow.price_per_unit || 0))}
              </div>
            </div>
            <div>
              <label className="label">Примечание</label>
              <input className="input" value={editRow.comment || ''} onChange={e => setEditRow({...editRow, comment: e.target.value})} />
            </div>
            <div>
              <label className="label">Проект</label>
              <select className="input" value={(editRow as any).project_id || ''} onChange={e => setEditRow({...editRow, ...(e.target.value ? { project_id: parseInt(e.target.value) } : { project_id: null })} as any)}>
                <option value="">— не привязан —</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <OrgSelector
                label="Организация"
                value={editRow.org_name || ''}
                onChange={(name, id) => setEditRow({...editRow, org_name: name, organization_id: id})}
                placeholder="— не указана —"
              />
            </div>
            <div>
              <label className="label">Статус оплаты</label>
              <div className="flex gap-2">
                <button onClick={() => setEditRow({...editRow, pay_status: 'paid'})}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-all ${editRow.pay_status !== 'debt' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  ✓ Оплачено
                </button>
                <button onClick={() => setEditRow({...editRow, pay_status: 'debt'})}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-all ${editRow.pay_status === 'debt' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  ⏳ В долг
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEditRow(null)}>Отмена</button>
            <button className="btn-primary" onClick={handleSaveEdit}>✓ Сохранить</button>
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Дата</th><th>Техника</th><th>Категория</th><th>Наименование</th><th className="text-center">Кол-во</th><th className="text-right">Цена</th><th className="text-right">Сумма</th><th>Проект</th><th>Организация</th><th>Статус</th><th></th></tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
              : items.length === 0
                ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Расходов за период нет</td></tr>
                : displayItems.map(e => (
                  <tr key={e.id} className={editRow?.id === e.id ? 'bg-orange-50' : ''}>
                    <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="font-medium">{e.truck_plate}</td>
                    <td><span className="badge badge-gray">{e.category}</span></td>
                    <td>{e.name}{e.part_name ? <span className="text-slate-400 text-xs ml-1">(склад)</span> : ''}</td>
                    <td className="text-center">{e.qty} {e.unit || ''}</td>
                    <td className="text-right text-slate-500">{formatMoney(e.price_per_unit)}</td>
                    <td className="text-right font-semibold text-red-600">{formatMoney(e.amount)}</td>
                    <td className="text-xs text-slate-400">{e.comment || '—'}</td>
                    <td className="text-xs text-slate-500">{(e as any).project_name || '—'}</td>
                    <td className="text-xs text-slate-500">{e.org_name || '—'}</td>
                    <td>
                      {e.pay_status === 'debt' && !e.debt_closed_at
                        ? <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">⏳ Долг</span>
                        : e.pay_status === 'debt' && e.debt_closed_at
                          ? <span className="text-xs text-green-600">✓ Погашен</span>
                          : <span className="text-xs text-slate-400">Оплачено</span>
                      }
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleCopy(e)} className="text-slate-400 hover:text-green-600 text-sm px-1.5 py-0.5 rounded hover:bg-green-50" title="Скопировать">📋</button>
                        <button onClick={() => setEditRow(editRow?.id === e.id ? null : e)} className="text-slate-400 hover:text-primary-600 text-sm px-1.5 py-0.5 rounded hover:bg-primary-50">✏️</button>
                        <button onClick={() => handleDelete(e.id)} className="text-slate-400 hover:text-red-600 text-sm px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}
