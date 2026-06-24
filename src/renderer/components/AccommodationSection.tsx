import { useState, useEffect } from 'react'
import { OrgSelector } from './OrgSelector'

const api = () => window.api

interface Settings {
  accommodation_cost: number
  meal_cost: number
  accommodation_org_id?: number
  meal_org_id?: number
  end_date?: string
}

interface Worker {
  id: number
  employee_id: number
  full_name: string
  start_date: string
  end_date?: string
}

interface Debt {
  id: number
  period_month: string
  type: 'accommodation' | 'meal'
  amount: number
  days_count: number
  workers_count: number
  actual_amount?: number | null
  closed_at?: string
  closed_amount?: number
}

interface Driver { id: number; full_name: string }

export function AccommodationSection({ projectId }: { projectId: number }) {
  const [settings, setSettings]   = useState<Settings>({ accommodation_cost: 0, meal_cost: 0 })
  const [workers, setWorkers]     = useState<Worker[]>([])
  const [debts, setDebts]         = useState<Debt[]>([])
  const [drivers, setDrivers]     = useState<Driver[]>([])
  const [saving, setSaving]       = useState(false)
  const [calcMonth, setCalcMonth] = useState(new Date().toISOString().slice(0, 7))
  const [calcResult, setCalcResult] = useState<string>('')
  const [showWorkerForm, setShowWorkerForm] = useState(false)
  const [workerForm, setWorkerForm] = useState({ employee_id: '', start_date: '', end_date: '' })
  const [closeForm, setCloseForm] = useState<{ debtId: number; amount: string } | null>(null)
  const [editActual, setEditActual] = useState<{ debtId: number; value: string } | null>(null)
  const [editWorker, setEditWorker] = useState<Worker | null>(null)
  const [editForm, setEditForm] = useState({ start_date: '', end_date: '' })
  const [expanded, setExpanded]   = useState(false)
  const [accOrgName, setAccOrgName] = useState('')
  const [mealOrgName, setMealOrgName] = useState('')

  useEffect(() => { loadAll() }, [projectId])

  async function loadAll() {
    const [s, w, d, dr] = await Promise.all([
      api().accommodation.getSettings(projectId),
      api().accommodation.getWorkers(projectId),
      api().accommodation.getDebts(projectId),
      api().employees.getAll({ role: 'driver' }),
    ])
    if (s) {
      setSettings(s)
      // Подтянуть имена организаций если они уже сохранены
      if (s.accommodation_org_id || s.meal_org_id) {
        const orgs = await api().organizations.getAll({})
        if (s.accommodation_org_id) {
          const org = orgs.find((o: any) => o.id === s.accommodation_org_id)
          if (org) setAccOrgName(org.name)
        }
        if (s.meal_org_id) {
          const org = orgs.find((o: any) => o.id === s.meal_org_id)
          if (org) setMealOrgName(org.name)
        }
      }
    }
    setWorkers(w)
    setDebts(d)
    setDrivers(dr)
  }

  async function handleSaveSettings() {
    setSaving(true)
    await api().accommodation.saveSettings(projectId, settings)
    setSaving(false)
    setCalcResult('✓ Настройки сохранены')
    setTimeout(() => setCalcResult(''), 2000)
  }

  async function handleCalc() {
    const r = await api().accommodation.calcDebts(projectId, calcMonth)
    if (r.ok) {
      setCalcResult(`✓ Рассчитано: ${r.workers_count} чел., ${r.calendar_days} кал. дн., итого ${r.total_days} чел/дн`)
      loadAll()
    } else {
      setCalcResult('⚠️ ' + r.error)
    }
    setTimeout(() => setCalcResult(''), 4000)
  }

  async function handleAddWorker() {
    if (!workerForm.employee_id || !workerForm.start_date) return
    await api().accommodation.setWorker(projectId, parseInt(workerForm.employee_id), workerForm.start_date, workerForm.end_date || undefined)
    setWorkerForm({ employee_id: '', start_date: '', end_date: '' })
    setShowWorkerForm(false)
    loadAll()
  }

  async function handleRemoveWorker(employeeId: number) {
    if (!confirm('Удалить водителя из проекта?')) return
    await api().accommodation.removeWorker(projectId, employeeId)
    loadAll()
  }

  function handleStartEdit(w: Worker) {
    setEditWorker(w)
    setEditForm({ start_date: w.start_date, end_date: w.end_date || '' })
  }

  async function handleSaveEdit() {
    if (!editWorker) return
    await api().accommodation.setWorker(projectId, editWorker.employee_id, editForm.start_date, editForm.end_date || undefined)
    setEditWorker(null)
    loadAll()
  }

  async function handleCloseDebt() {
    if (!closeForm) return
    await api().accommodation.closeDebt(closeForm.debtId, parseFloat(closeForm.amount) || 0)
    setCloseForm(null)
    loadAll()
  }

  async function handleSetActual() {
    if (!editActual) return
    const val = editActual.value.trim() === '' ? null : parseFloat(editActual.value)
    await api().accommodation.setActualAmount(editActual.debtId, val)
    setEditActual(null)
    loadAll()
  }

  const openDebts = debts.filter(d => !d.closed_at)
  const closedDebts = debts.filter(d => d.closed_at)
  const totalOpenDebt = openDebts.reduce((s, d) => s + (d.actual_amount != null ? d.actual_amount : d.amount), 0)

  const TYPE_LABEL = { accommodation: '🏠 Проживание', meal: '🍽 Питание' }

  return (
    <div className="card card-body space-y-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-700">🏠 Проживание и питание</h3>
          {totalOpenDebt > 0 && (
            <span className="badge badge-orange text-xs">
              Долг: {totalOpenDebt.toLocaleString('ru-RU')} ₽
            </span>
          )}
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="space-y-5 border-t border-slate-100 pt-4">

          {/* Настройки стоимости */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-600 uppercase tracking-wide">Стоимость в день</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">🏠 Проживание</span>
                </div>
                <input type="number" className="input" placeholder="0 ₽/день"
                  value={settings.accommodation_cost || ''}
                  onChange={e => setSettings({...settings, accommodation_cost: parseFloat(e.target.value) || 0})} />
                <OrgSelector
                  label="Поставщик услуги"
                  value={accOrgName || ''}
                  onChange={(name, id) => { setAccOrgName(name); setSettings({...settings, accommodation_org_id: id}) }}
                  placeholder="— не указан —"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">🍽 Питание</span>
                </div>
                <input type="number" className="input" placeholder="0 ₽/день"
                  value={settings.meal_cost || ''}
                  onChange={e => setSettings({...settings, meal_cost: parseFloat(e.target.value) || 0})} />
                <OrgSelector
                  label="Поставщик услуги"
                  value={mealOrgName || ''}
                  onChange={(name, id) => { setMealOrgName(name); setSettings({...settings, meal_org_id: id}) }}
                  placeholder="— не указан —"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Дата окончания проживания</label>
                <input type="date" className="input"
                  value={settings.end_date || ''}
                  onChange={e => setSettings({...settings, end_date: e.target.value || undefined})} />
                <p className="text-xs text-slate-400 mt-1">После этой даты дни не считаются</p>
              </div>
            </div>
            <button className="btn-primary" onClick={handleSaveSettings} disabled={saving}>
              {saving ? 'Сохранение...' : '✓ Сохранить настройки'}
            </button>
            {calcResult && <p className="text-sm text-green-600">{calcResult}</p>}
          </div>

          {/* Водители на проекте */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-600 uppercase tracking-wide">Водители на объекте</h4>
              <button className="btn-secondary text-xs" onClick={() => setShowWorkerForm(!showWorkerForm)}>
                {showWorkerForm ? '✕ Отмена' : '+ Добавить'}
              </button>
            </div>

            {showWorkerForm && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-3 border border-slate-200">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label">Водитель</label>
                    <select className="input" value={workerForm.employee_id}
                      onChange={e => setWorkerForm({...workerForm, employee_id: e.target.value})}>
                      <option value="">— выберите —</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Дата заезда</label>
                    <input type="date" className="input" value={workerForm.start_date}
                      onChange={e => setWorkerForm({...workerForm, start_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">Дата выезда</label>
                    <input type="date" className="input" value={workerForm.end_date}
                      onChange={e => setWorkerForm({...workerForm, end_date: e.target.value})} />
                    <p className="text-xs text-slate-400 mt-0.5">Не заполнять если ещё на объекте</p>
                  </div>
                </div>
                <button className="btn-primary text-sm" onClick={handleAddWorker}>✓ Добавить водителя</button>
              </div>
            )}

            {workers.length === 0 ? (
              <p className="text-sm text-slate-400">Водители не добавлены</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Водитель</th><th>Заезд</th><th>Выезд</th><th></th></tr>

                  </thead>
                  <tbody>
                    {workers.map(w => (
                      <>
                        <tr key={w.employee_id}>
                          <td className="font-medium select-text cursor-text">{w.full_name}</td>
                          <td className="select-text cursor-text">{w.start_date}</td>
                          <td className="select-text cursor-text">{w.end_date || <span className="text-green-600 text-xs">На объекте</span>}</td>
                          <td>
                            <div className="flex gap-1">
                              <button onClick={() => handleStartEdit(w)}
                                className="text-slate-400 hover:text-blue-600 text-sm px-1.5 py-0.5 rounded hover:bg-blue-50">✏️</button>
                              <button onClick={() => handleRemoveWorker(w.employee_id)}
                                className="text-slate-400 hover:text-red-600 text-sm px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                            </div>
                          </td>
                        </tr>
                        {editWorker?.employee_id === w.employee_id && (
                          <tr key={`edit-${w.employee_id}`} className="bg-blue-50">
                            <td colSpan={4}>
                              <div className="flex items-end gap-3 px-1 py-2">
                                <div>
                                  <label className="label">Дата заезда</label>
                                  <input type="date" className="input w-36"
                                    value={editForm.start_date}
                                    onChange={e => setEditForm({...editForm, start_date: e.target.value})} />
                                </div>
                                <div>
                                  <label className="label">Дата выезда</label>
                                  <input type="date" className="input w-36"
                                    value={editForm.end_date}
                                    onChange={e => setEditForm({...editForm, end_date: e.target.value})} />
                                  <p className="text-xs text-slate-400 mt-0.5">Оставить пустым — на объекте</p>
                                </div>
                                <button className="btn-primary text-sm" onClick={handleSaveEdit}>✓ Сохранить</button>
                                <button className="btn-ghost text-sm" onClick={() => setEditWorker(null)}>Отмена</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Расчёт долга за месяц */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-sm font-medium text-slate-600 uppercase tracking-wide">Рассчитать долг за месяц</h4>
            <div className="flex items-center gap-3">
              <input type="month" className="input w-40" value={calcMonth}
                onChange={e => setCalcMonth(e.target.value)} />
              <button className="btn-primary" onClick={handleCalc}>📊 Рассчитать</button>
            </div>
          </div>

          {/* Долги */}
          {openDebts.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-600 uppercase tracking-wide">⏳ Открытые долги</h4>
                <span className="font-bold text-orange-600">{totalOpenDebt.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className="space-y-2">
                {openDebts.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-orange-50 rounded-lg px-4 py-3 border border-orange-100">
                    <div>
                      <span className="font-medium text-sm">{TYPE_LABEL[d.type]}</span>
                      <span className="text-xs text-slate-500 ml-2">{d.period_month}</span>
                      <span className="text-xs text-slate-400 ml-2">{d.days_count} дн. / {d.workers_count} чел.</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Расчётная сумма */}
                      <div className="text-right">
                        <div className="text-xs text-slate-400">расчёт</div>
                        <div className="text-sm text-slate-500 line-through-if-actual" style={d.actual_amount != null ? {textDecoration:'line-through', opacity:0.5} : {}}>{d.amount.toLocaleString('ru-RU')} ₽</div>
                      </div>
                      {/* Фактическая сумма */}
                      {editActual?.debtId === d.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            className="input w-28 text-sm"
                            placeholder="Факт, ₽"
                            autoFocus
                            value={editActual.value}
                            onChange={e => setEditActual({...editActual, value: e.target.value})}
                            onKeyDown={e => { if (e.key === 'Enter') handleSetActual(); if (e.key === 'Escape') setEditActual(null) }}
                          />
                          <button className="btn-primary text-xs px-2" onClick={handleSetActual}>✓</button>
                          <button className="btn-ghost text-xs px-2" onClick={() => setEditActual(null)}>✕</button>
                        </div>
                      ) : (
                        <div className="text-right cursor-pointer group" onClick={() => setEditActual({ debtId: d.id, value: d.actual_amount != null ? String(d.actual_amount) : '' })}>
                          <div className="text-xs text-slate-400">факт</div>
                          {d.actual_amount != null
                            ? <div className="font-bold text-orange-600">{d.actual_amount.toLocaleString('ru-RU')} ₽ <span className="text-xs text-slate-400 group-hover:text-blue-500">✏️</span></div>
                            : <div className="text-sm text-slate-300 hover:text-blue-400 border border-dashed border-slate-200 rounded px-2 py-0.5">+ ввести</div>
                          }
                        </div>
                      )}
                      {closeForm?.debtId === d.id ? (
                        <div className="flex items-center gap-2">
                          <input type="number" className="input w-32 text-sm" placeholder="Сумма"
                            value={closeForm.amount}
                            onChange={e => setCloseForm({...closeForm, amount: e.target.value})} />
                          <button className="btn-primary text-xs" onClick={handleCloseDebt}>✓</button>
                          <button className="btn-ghost text-xs" onClick={() => setCloseForm(null)}>✕</button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => setCloseForm({ debtId: d.id, amount: String(d.amount) })}
                            className="btn-secondary text-xs">Списать всё</button>
                          <button onClick={() => setCloseForm({ debtId: d.id, amount: '' })}
                            className="btn-ghost text-xs">Частично</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Закрытые долги */}
          {closedDebts.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <details>
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                  Закрытые долги ({closedDebts.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {closedDebts.map(d => (
                    <div key={d.id} className="flex items-center justify-between text-sm text-slate-500 px-3 py-2 bg-slate-50 rounded">
                      <span>{TYPE_LABEL[d.type]} · {d.period_month}</span>
                      <span className="line-through">{d.amount.toLocaleString('ru-RU')} ₽</span>
                      <span className="text-green-600">✓ {d.closed_amount?.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
