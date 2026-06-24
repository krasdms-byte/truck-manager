import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatMoney, currentMonth, formatMonth, todayISO } from '../utils/format'

interface Employee {
  id: number; full_name: string; role: 'driver' | 'mechanic'
  truck_id?: number; truck_plate?: string
  salary_type: 'formula' | 'fixed'; salary_gross: number; salary_fixed?: number
  tax_rate: number; active: number
}
interface Truck { id: number; plate: string; model?: string }
interface Shift { date: string; employee_id: number; truck_id?: number; shift_type?: string; worked: number }

const api = () => window.api

function getDaysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  return Array.from({ length: days }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return `${yearMonth}-${d}`
  })
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr).getDay()
  return d === 0 || d === 6
}

const DAY_LABELS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

export function EmployeesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'calendar' | 'list'>('calendar')
  const [month, setMonth] = useState(currentMonth())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [trucks, setTrucks]       = useState<Truck[]>([])
  const [shifts, setShifts]       = useState<Shift[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editEmpId, setEditEmpId] = useState<number | null>(null)
  const [editForm, setEditForm]   = useState<any>({})
  const [form, setForm]           = useState({ full_name: '', role: 'driver', truck_id: '', salary_type: 'formula', salary_gross: '180000', salary_fixed: '', tax_rate: '0.06' })

  // Форма добавления смены
  const [shiftModal, setShiftModal] = useState<{ empId: number; date: string } | null>(null)
  const [shiftForm, setShiftForm]   = useState({ truck_id: '', shift_type: 'day', worked: '1' })

  const days = getDaysInMonth(month)

  useEffect(() => {
    api().trucks.getAll().then(setTrucks)
  }, [])

  useEffect(() => { loadAll() }, [month])

  async function loadAll() {
    setLoading(true)
    const [emps, sh] = await Promise.all([
      api().employees.getAll({ active: 1 }),
      api().employees.getShifts({ month }),
    ])
    setEmployees(emps)
    setShifts(sh)
    setLoading(false)
  }

  function getShift(employeeId: number, date: string): Shift | undefined {
    return shifts.find(s => s.employee_id === employeeId && s.date === date)
  }

  // Открыть форму смены: предзаполнить из последней записи водителя
  function openShiftModal(emp: Employee, date: string) {
    const existing = getShift(emp.id, date)
    if (existing) {
      // Уже есть смена — сразу снимаем галочку
      api().employees.setShift({ date, employee_id: emp.id, worked: 0, shift_type: existing.shift_type || 'day', truck_id: existing.truck_id || null })
        .then(loadAll)
      return
    }
    // Ищем последнюю смену этого водителя для предзаполнения
    const lastShift = [...shifts]
      .filter(s => s.employee_id === emp.id && s.worked)
      .sort((a, b) => b.date.localeCompare(a.date))[0]

    setShiftForm({
      truck_id: String(lastShift?.truck_id || emp.truck_id || trucks[0]?.id || ''),
      shift_type: lastShift?.shift_type || 'day',
      worked: '1',
    })
    setShiftModal({ empId: emp.id, date })
  }

  async function handleShiftSave() {
    if (!shiftModal) return
    await api().employees.setShift({
      date: shiftModal.date,
      employee_id: shiftModal.empId,
      truck_id: shiftForm.truck_id ? parseInt(shiftForm.truck_id) : null,
      shift_type: shiftForm.shift_type,
      worked: parseInt(shiftForm.worked),
    })
    setShiftModal(null)
    loadAll()
  }

  function workedDays(employeeId: number): number {
    return shifts.filter(s => s.employee_id === employeeId && s.worked).length
  }

  async function handleSave() {
    if (!form.full_name) return
    await api().employees.create({
      ...form,
      truck_id: form.truck_id ? parseInt(form.truck_id) : null,
      salary_gross: parseFloat(form.salary_gross) || 0,
      salary_fixed: form.salary_fixed ? parseFloat(form.salary_fixed) : null,
      tax_rate: parseFloat(form.tax_rate) || 0.06,
    })
    setShowForm(false); loadAll()
  }

  function openEditEmp(e: Employee) {
    setEditForm({
      full_name: e.full_name, role: e.role,
      truck_id: e.truck_id?.toString() || '',
      salary_type: e.salary_type,
      salary_gross: e.salary_gross.toString(),
      salary_fixed: e.salary_fixed?.toString() || '',
      tax_rate: e.tax_rate.toString(),
      active: e.active.toString(),
    })
    setEditEmpId(e.id)
    setTab('list')
  }

  async function handleEditSave() {
    if (!editEmpId || !editForm.full_name) return
    await api().employees.update(editEmpId, {
      ...editForm,
      truck_id: editForm.truck_id ? parseInt(editForm.truck_id) : null,
      salary_gross: parseFloat(editForm.salary_gross) || 0,
      salary_fixed: editForm.salary_fixed ? parseFloat(editForm.salary_fixed) : null,
      tax_rate: parseFloat(editForm.tax_rate) || 0.06,
      active: parseInt(editForm.active),
    })
    setEditEmpId(null)
    loadAll()
  }

  const drivers   = employees.filter(e => e.role === 'driver')
  const mechanics = employees.filter(e => e.role === 'mechanic')

  // Водитель для модалки
  const shiftEmp = shiftModal ? employees.find(e => e.id === shiftModal.empId) : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Сотрудники</h1>
          <p className="text-sm text-slate-500">
            Водителей: <span className="font-semibold text-primary-600">{drivers.length}</span>
            {' · '}Механиков: <span className="font-semibold">{mechanics.length}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['calendar', 'list'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {t === 'calendar' ? '📅 Журнал смен' : '👷 Список'}
              </button>
            ))}
          </div>
          {tab === 'calendar' && (
            <input type="month" className="input w-44" value={month} onChange={e => setMonth(e.target.value)} />
          )}
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Добавить</button>
        </div>
      </div>

      {/* Модальное окно добавления смены */}
      {shiftModal && shiftEmp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">{shiftEmp.full_name}</h3>
                <p className="text-sm text-slate-400">
                  {new Date(shiftModal.date).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button className="text-slate-400 hover:text-slate-600 text-xl" onClick={() => setShiftModal(null)}>✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Техника</label>
                <select className="input" value={shiftForm.truck_id} onChange={e => setShiftForm({...shiftForm, truck_id: e.target.value})}>
                  <option value="">— не указана —</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>{t.plate}{t.model ? ` (${t.model})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Тип смены</label>
                <div className="flex gap-2">
                  {[['day','☀️ День'],['night','🌙 Ночь']].map(([v, l]) => (
                    <button key={v} onClick={() => setShiftForm({...shiftForm, shift_type: v})}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${shiftForm.shift_type === v ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Статус</label>
                <div className="flex gap-2">
                  {[['1','✓ Отработал'],['0','✕ Не вышел']].map(([v, l]) => (
                    <button key={v} onClick={() => setShiftForm({...shiftForm, worked: v})}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${shiftForm.worked === v ? (v === '1' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500') : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShiftModal(null)}>Отмена</button>
              <button className="btn-primary flex-1" onClick={handleShiftSave}>✓ Сохранить смену</button>
            </div>
          </div>
        </div>
      )}

      {/* Форма добавления сотрудника */}
      {showForm && (
        <div className="card card-body space-y-4 border-2 border-primary-200">
          <h3 className="font-semibold text-slate-700">Новый сотрудник</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">ФИО *</label>
              <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} autoFocus /></div>
            <div><label className="label">Роль</label>
              <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value, salary_type: e.target.value === 'mechanic' ? 'fixed' : 'formula'})}>
                <option value="driver">Водитель</option>
                <option value="mechanic">Механик</option>
              </select></div>
            <div><label className="label">Техника</label>
              <select className="input" value={form.truck_id} onChange={e => setForm({...form, truck_id: e.target.value})}>
                <option value="">— не закреплён —</option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
              </select></div>
            <div><label className="label">Тип ЗП</label>
              <select className="input" value={form.salary_type} onChange={e => setForm({...form, salary_type: e.target.value})}>
                <option value="formula">По дням</option>
                <option value="fixed">Фиксированная</option>
              </select></div>
            {form.salary_type === 'formula'
              ? <div><label className="label">Оклад, ₽</label>
                  <input type="number" className="input" value={form.salary_gross} onChange={e => setForm({...form, salary_gross: e.target.value})} /></div>
              : <div><label className="label">Фикс. сумма, ₽</label>
                  <input type="number" className="input" value={form.salary_fixed} onChange={e => setForm({...form, salary_fixed: e.target.value})} /></div>
            }
            <div><label className="label">Налог</label>
              <select className="input" value={form.tax_rate} onChange={e => setForm({...form, tax_rate: e.target.value})}>
                <option value="0.06">6%</option>
                <option value="0.13">13%</option>
                <option value="0">0%</option>
              </select></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Отмена</button>
            <button className="btn-primary" onClick={handleSave}>Сохранить</button>
          </div>
        </div>
      )}

      {/* ЖУРНАЛ СМЕН */}
      {tab === 'calendar' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-700">Журнал смен — {formatMonth(month)}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Нажмите на дату чтобы добавить смену · повторный клик снимает</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-4 py-2 font-medium text-slate-600 border-b border-slate-200 sticky left-0 bg-slate-50 z-10 min-w-48">
                      Сотрудник
                    </th>
                    <th className="px-2 py-2 font-medium text-slate-500 border-b border-slate-200 text-center min-w-8">
                      Дней
                    </th>
                    {days.map(date => {
                      const dow = (new Date(date).getDay() + 6) % 7
                      const weekend = isWeekend(date)
                      const day = parseInt(date.split('-')[2])
                      return (
                        <th key={date} className={`px-1 py-1 border-b border-slate-200 text-center min-w-8 ${weekend ? 'bg-red-50' : ''}`}>
                          <div className="text-xs font-medium text-slate-500">{DAY_LABELS[dow]}</div>
                          <div className={`text-sm font-bold ${weekend ? 'text-red-400' : 'text-slate-700'}`}>{day}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={days.length + 2} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
                  ) : drivers.length === 0 ? (
                    <tr><td colSpan={days.length + 2} className="text-center py-8 text-slate-400">Нет водителей</td></tr>
                  ) : drivers.map((emp, idx) => {
                    const worked = workedDays(emp.id)
                    return (
                      <tr key={emp.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className={`px-4 py-2 border-b border-slate-100 sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          <div className="font-medium text-slate-800 text-sm">{emp.full_name}</div>
                          {emp.truck_plate && <div className="text-xs text-slate-400">{emp.truck_plate}</div>}
                        </td>
                        <td className="px-2 py-2 border-b border-slate-100 text-center">
                          <span className={`text-sm font-bold ${worked > 0 ? 'text-primary-600' : 'text-slate-400'}`}>{worked}</span>
                        </td>
                        {days.map(date => {
                          const shift = getShift(emp.id, date)
                          const isWorked = shift?.worked
                          const weekend = isWeekend(date)
                          const truckPlate = shift?.truck_id ? trucks.find(t => t.id === shift.truck_id)?.plate : null
                          return (
                            <td key={date}
                              onClick={() => openShiftModal(emp, date)}
                              className={`border-b border-slate-100 text-center cursor-pointer transition-colors select-none
                                ${weekend ? 'bg-red-50/50 hover:bg-red-100/50' : ''}
                                ${isWorked ? 'bg-green-100 hover:bg-green-200' : 'hover:bg-slate-100'}
                              `}
                              title={isWorked
                                ? `${shift?.shift_type === 'night' ? 'Ночь' : 'День'}${truckPlate ? ' · ' + truckPlate : ''} · нажмите чтобы снять`
                                : 'Нажмите чтобы добавить смену'}
                            >
                              <div className="py-2 px-1">
                                {isWorked
                                  ? <div>
                                      <span className="text-green-600 font-bold text-base block">{shift?.shift_type === 'night' ? '🌙' : '✓'}</span>
                                      {truckPlate && <span className="text-green-700 text-xs leading-none block">{truckPlate}</span>}
                                    </div>
                                  : <span className="text-slate-200 text-xs">·</span>
                                }
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Итоги по водителям */}
          {drivers.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {drivers.map(emp => {
                const worked = workedDays(emp.id)
                const total = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate()
                return (
                  <div key={emp.id} className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0">
                      {emp.full_name.split(' ').map(n => n[0]).join('').slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 text-sm truncate">{emp.full_name}</div>
                      <div className="text-xs text-slate-500">{worked} из {total} дней</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary-600">{worked}</div>
                      <div className="text-xs text-slate-400">смен</div>
                    </div>
                    <button className="btn-ghost text-xs py-1" onClick={() => navigate(`/employees/${emp.id}`)}>ЗП →</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* СПИСОК СОТРУДНИКОВ */}
      {tab === 'list' && (
        <div className="space-y-3">
          {editEmpId && (
            <div className="card card-body space-y-4 border-2 border-primary-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">Редактировать сотрудника</h3>
                <button className="btn-ghost text-xs" onClick={() => setEditEmpId(null)}>✕ Закрыть</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">ФИО *</label>
                  <input className="input" value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} /></div>
                <div><label className="label">Роль</label>
                  <select className="input" value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value, salary_type: e.target.value === 'mechanic' ? 'fixed' : editForm.salary_type})}>
                    <option value="driver">Водитель</option>
                    <option value="mechanic">Механик</option>
                  </select></div>
                <div><label className="label">Техника</label>
                  <select className="input" value={editForm.truck_id} onChange={e => setEditForm({...editForm, truck_id: e.target.value})}>
                    <option value="">— не закреплён —</option>
                    {trucks.map(t => <option key={t.id} value={t.id}>{t.plate}</option>)}
                  </select></div>
                <div><label className="label">Тип ЗП</label>
                  <select className="input" value={editForm.salary_type} onChange={e => setEditForm({...editForm, salary_type: e.target.value})}>
                    <option value="formula">По дням</option>
                    <option value="fixed">Фиксированная</option>
                  </select></div>
                {editForm.salary_type === 'formula'
                  ? <div><label className="label">Оклад, ₽</label>
                      <input type="number" className="input" value={editForm.salary_gross} onChange={e => setEditForm({...editForm, salary_gross: e.target.value})} /></div>
                  : <div><label className="label">Фикс. сумма, ₽</label>
                      <input type="number" className="input" value={editForm.salary_fixed} onChange={e => setEditForm({...editForm, salary_fixed: e.target.value})} /></div>
                }
                <div><label className="label">Налог</label>
                  <select className="input" value={editForm.tax_rate} onChange={e => setEditForm({...editForm, tax_rate: e.target.value})}>
                    <option value="0.06">6%</option>
                    <option value="0.13">13%</option>
                    <option value="0">0%</option>
                  </select></div>
                <div><label className="label">Статус</label>
                  <select className="input" value={editForm.active} onChange={e => setEditForm({...editForm, active: e.target.value})}>
                    <option value="1">Активен</option>
                    <option value="0">Уволен</option>
                  </select></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button className="btn-secondary" onClick={() => setEditEmpId(null)}>Отмена</button>
                <button className="btn-primary" onClick={handleEditSave}>✓ Сохранить</button>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>ФИО</th><th>Роль</th><th>Техника</th><th>Тип ЗП</th><th className="text-right">Оклад / Фикс.</th><th>Налог</th><th>Статус</th><th></th></tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} className={editEmpId === e.id ? 'bg-primary-50' : ''}>
                    <td className="font-medium">{e.full_name}</td>
                    <td><span className={`badge ${e.role === 'driver' ? 'badge-blue' : 'badge-yellow'}`}>{e.role === 'driver' ? '🚛 Водитель' : '🔧 Механик'}</span></td>
                    <td>{e.truck_plate || '—'}</td>
                    <td className="text-xs text-slate-500">{e.salary_type === 'formula' ? 'По дням' : 'Фиксированная'}</td>
                    <td className="text-right">{formatMoney(e.salary_type === 'fixed' ? e.salary_fixed : e.salary_gross)}</td>
                    <td>{(e.tax_rate * 100).toFixed(0)}%</td>
                    <td><span className={`badge ${e.active ? 'badge-green' : 'badge-gray'}`}>{e.active ? 'Активен' : 'Уволен'}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button className="text-slate-400 hover:text-primary-600 text-sm px-1.5 py-0.5 rounded hover:bg-primary-50"
                          onClick={() => openEditEmp(e)}>✏️</button>
                        <button className="btn-ghost text-xs py-1" onClick={() => navigate(`/employees/${e.id}`)}>ЗП →</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
