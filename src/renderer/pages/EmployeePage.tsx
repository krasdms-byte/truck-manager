import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { formatMoney, formatDate, currentMonth, formatMonth, todayISO } from '../utils/format'
import type { Employee, SalaryResult, Payment } from '../types'

export function EmployeePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const empId = parseInt(id!)

  const [emp, setEmp]         = useState<Employee | null>(null)
  const [month, setMonth]     = useState(currentMonth())
  const [salary, setSalary]   = useState<SalaryResult | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [showPay, setShowPay] = useState(false)
  const [payForm, setPayForm] = useState({ date: todayISO(), amount: '', comment: '' })

  useEffect(() => {
    window.api.employees.getById(empId).then(setEmp)
  }, [empId])

  useEffect(() => {
    loadSalary()
  }, [month, empId])

  async function loadSalary() {
    const [s, p] = await Promise.all([
      window.api.employees.getSalary(empId, month),
      window.api.employees.getPayments({ employee_id: empId, month }),
    ])
    setSalary(s); setPayments(p)
  }

  async function handlePay() {
    if (!payForm.amount) return
    await window.api.employees.addPayment({ ...payForm, employee_id: empId, month, amount: parseFloat(payForm.amount) })
    setShowPay(false)
    setPayForm({ date: todayISO(), amount: '', comment: '' })
    loadSalary()
  }

  const balanceColor = (v?: number) => !v ? '' : v >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => navigate('/employees')}>← Назад</button>
        <h1 className="text-xl font-bold text-slate-800">{emp?.full_name ?? '...'}</h1>
        <span className={`badge ${emp?.role === 'driver' ? 'badge-blue' : 'badge-yellow'}`}>
          {emp?.role === 'driver' ? '🚛 Водитель' : '🔧 Механик'}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Расчёт зарплаты</h2>
        <input type="month" className="input w-44" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {/* Карточка зарплаты */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Отработано дней', value: salary ? `${salary.worked_days} из ${salary.total_days}` : '—', color: 'text-slate-700' },
          { label: 'ЗП нетто', value: formatMoney(salary?.salary_net), color: 'text-primary-600' },
          { label: 'Выплачено', value: formatMoney(salary?.paid), color: 'text-green-600' },
          { label: 'Сальдо (к выплате)', value: formatMoney(salary?.balance), color: balanceColor(salary?.balance) },
          { label: 'Оклад до налогов', value: formatMoney(salary?.salary_gross), color: 'text-slate-500' },
          { label: 'Налог', value: emp ? `${(emp.tax_rate * 100).toFixed(0)}%` : '—', color: 'text-slate-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</div>
            <div className={`text-lg font-bold ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Выплаты */}
      <div className="card card-body space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">Выплаты за {formatMonth(month)}</h3>
          <button className="btn-primary text-xs" onClick={() => setShowPay(true)}>+ Выплата</button>
        </div>

        {showPay && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Дата</label><input type="date" className="input" value={payForm.date} onChange={e => setPayForm({...payForm, date: e.target.value})} /></div>
              <div><label className="label">Сумма, ₽</label><input type="number" className="input" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} /></div>
              <div><label className="label">Примечание</label><input className="input" placeholder="нал / безнал" value={payForm.comment} onChange={e => setPayForm({...payForm, comment: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowPay(false)}>Отмена</button>
              <button className="btn-primary" onClick={handlePay}>Сохранить</button>
            </div>
          </div>
        )}

        {payments.length === 0
          ? <div className="text-center py-6 text-slate-400">Выплат за период нет</div>
          : <table className="table">
              <thead><tr><th>Дата</th><th className="text-right">Сумма</th><th>Примечание</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{formatDate(p.date)}</td>
                    <td className="text-right font-medium text-green-600">{formatMoney(p.amount)}</td>
                    <td className="text-slate-500 text-xs">{p.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  )
}
