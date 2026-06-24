import { useState, useEffect } from 'react'
import { formatMoney, formatDate, todayISO, monthStartISO, monthEndISO, currentMonth } from '../utils/format'
import type { Income } from '../types'

interface Project { id: number; name: string }

export function IncomePage() {
  const [items, setItems]       = useState<Income[]>([])
  const [total, setTotal]       = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [month, setMonth]       = useState(currentMonth())
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]     = useState<number | null>(null)
  const emptyForm = { date: todayISO(), from_who: '', account_number: '', period_from: '', period_to: '', amount: '', comment: '', project_id: '' }
  const [form, setForm]         = useState(emptyForm)

  const from = monthStartISO(new Date(month + '-01'))
  const to   = monthEndISO(new Date(month + '-01'))

  useEffect(() => {
    window.api.projects.getAll({}).then(setProjects)
  }, [])

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const [data, t] = await Promise.all([
      window.api.income.getAll({ from, to }),
      window.api.income.getTotal({ from, to }),
    ])
    setItems(data); setTotal(t); setLoading(false)
  }

  function openCreate() {
    setForm(emptyForm); setEditId(null); setShowForm(true)
  }

  function openEdit(i: Income) {
    setForm({
      date: i.date, from_who: i.from_who,
      account_number: i.account_number || '',
      period_from: i.period_from || '', period_to: i.period_to || '',
      amount: i.amount.toString(), comment: i.comment || '',
      project_id: (i as any).project_id?.toString() || '',
    })
    setEditId(i.id); setShowForm(true)
  }

  async function handleSave() {
    if (!form.from_who || !form.amount) return
    const data = { ...form, amount: parseFloat(form.amount), project_id: form.project_id ? parseInt(form.project_id) : null }
    if (editId) {
      await window.api.income.update(editId, data)
    } else {
      await window.api.income.create(data)
    }
    setShowForm(false); setEditId(null); load()
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить поступление?')) return
    await window.api.income.remove(id); load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Поступления</h1>
          <p className="text-sm text-slate-500">Итого: <span className="font-semibold text-green-600">{formatMoney(total)}</span></p>
        </div>
        <div className="flex gap-3">
          <input type="month" className="input w-44" value={month} onChange={e => setMonth(e.target.value)} />
          <button className="btn-primary" onClick={openCreate}>+ Добавить</button>
        </div>
      </div>

      {showForm && (
        <div className="card card-body space-y-4 border-2 border-green-200">
          <h3 className="font-semibold text-slate-700">{editId ? 'Редактировать поступление' : 'Новое поступление'}</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Дата</label>
              <input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            <div><label className="label">От кого *</label>
              <input className="input" value={form.from_who} onChange={e => setForm({...form, from_who: e.target.value})} /></div>
            <div><label className="label">Проект</label>
              <select className="input" value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})}>
                <option value="">— без проекта —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div><label className="label">№ счёта / платёжки</label>
              <input className="input" value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} /></div>
            <div><label className="label">Период с</label>
              <input type="date" className="input" value={form.period_from} onChange={e => setForm({...form, period_from: e.target.value})} /></div>
            <div><label className="label">Период по</label>
              <input type="date" className="input" value={form.period_to} onChange={e => setForm({...form, period_to: e.target.value})} /></div>
            <div><label className="label">Сумма, ₽ *</label>
              <input type="number" className="input" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
            <div className="col-span-2"><label className="label">Примечание</label>
              <input className="input" value={form.comment} onChange={e => setForm({...form, comment: e.target.value})} /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Отмена</button>
            <button className="btn-primary" onClick={handleSave}>{editId ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Дата</th><th>От кого</th><th>Проект</th><th>№ счёта</th><th>Период</th><th className="text-right">Сумма</th><th>Примечание</th><th></th></tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
              : items.length === 0
                ? <tr><td colSpan={8} className="text-center py-8 text-slate-400">Нет поступлений за период</td></tr>
                : items.map(i => (
                  <tr key={i.id} className={editId === i.id ? 'bg-green-50' : ''}>
                    <td>{formatDate(i.date)}</td>
                    <td className="font-medium">{i.from_who}</td>
                    <td className="text-xs text-slate-500">{projects.find(p => p.id === (i as any).project_id)?.name || '—'}</td>
                    <td className="text-slate-500 text-xs">{i.account_number || '—'}</td>
                    <td className="text-xs text-slate-500">{i.period_from ? `${formatDate(i.period_from)} – ${formatDate(i.period_to)}` : '—'}</td>
                    <td className="text-right font-semibold text-green-600">{formatMoney(i.amount)}</td>
                    <td className="text-slate-500 text-xs">{i.comment || '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(i)} className="text-slate-400 hover:text-primary-600 text-xs px-1">✏️</button>
                        <button onClick={() => handleDelete(i.id)} className="text-slate-400 hover:text-red-600 text-xs px-1">✕</button>
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
