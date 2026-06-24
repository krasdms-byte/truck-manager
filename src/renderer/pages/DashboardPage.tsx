import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { formatMoney, monthStartISO, monthEndISO, formatMonth, currentMonth } from '../utils/format'
import type { KPISummary, MonthlyData, TruckReport } from '../types'

export function DashboardPage() {
  const navigate = useNavigate()
  const [month, setMonth]     = useState(currentMonth())
  const [kpi, setKpi]         = useState<KPISummary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [byTruck, setByTruck] = useState<TruckReport[]>([])
  const [loading, setLoading] = useState(true)
  const year = parseInt(month.split('-')[0])

  useEffect(() => { loadData() }, [month])

  async function loadData() {
    setLoading(true)
    const from = monthStartISO(new Date(month + '-01'))
    const to   = monthEndISO(new Date(month + '-01'))
    const [kpiData, monthlyData, truckData] = await Promise.all([
      window.api.reports.getSummary({ from, to }),
      window.api.reports.getMonthly(year),
      window.api.reports.getByTruck({ from, to }),
    ])
    setKpi(kpiData); setMonthly(monthlyData); setByTruck(truckData)
    setLoading(false)
  }

  const profitColor = (v: number) => v >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Сводка</h1>
          <p className="text-sm text-slate-500">{formatMonth(month)}</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" className="input w-44" value={month} onChange={e => setMonth(e.target.value)} />
          <button className="btn-secondary" onClick={() => window.print()}>🖨 PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Доходы',   value: kpi?.income,   color: 'text-green-600', icon: '💰' },
          { label: 'Расходы',  value: kpi?.expenses, color: 'text-red-600',   icon: '🔧' },
          { label: 'Прибыль',  value: kpi?.profit,   color: kpi ? profitColor(kpi.profit) : '', icon: '📈' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="kpi-card">
            <span className="kpi-label">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <span className={`kpi-value ${color}`}>{loading ? '—' : formatMoney(value ?? 0)}</span>
            </div>
          </div>
        ))}
        <div className="kpi-card">
          <span className="kpi-label">Техника</span>
          <div className="flex items-center gap-2">
            <span className="text-xl">🚛</span>
            <span className="kpi-value text-primary-600">{loading ? '—' : kpi?.trucks ?? 0}</span>
          </div>
          <span className="text-xs text-slate-400">активных в парке</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-slate-700">Доходы / Расходы по месяцам {year}</h2>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly} margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v/1000).toFixed(0)}к`} />
              <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income"   name="Доходы"  fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Расходы" fill="#ef4444" radius={[4,4,0,0]} />
              <Bar dataKey="profit"   name="Прибыль" fill="#2e75b6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">По технике</h2>
          <button className="btn-ghost text-xs" onClick={() => navigate('/report')}>Подробный отчёт →</button>
        </div>
        <div className="table-wrap rounded-none border-0">
          <table className="table">
            <thead><tr><th>Техника</th><th>Доходы</th><th>Расходы</th><th>Прибыль</th></tr></thead>
            <tbody>
              {loading
                ? <tr><td colSpan={4} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
                : byTruck.length === 0
                  ? <tr><td colSpan={4} className="text-center py-8 text-slate-400">Нет данных за период</td></tr>
                  : byTruck.map(t => (
                    <tr key={t.truck_id}>
                      <td className="font-medium">{t.plate}{t.model ? ` (${t.model})` : ''}</td>
                      <td className="text-green-600 font-medium">{formatMoney(t.income)}</td>
                      <td className="text-red-600">{formatMoney(t.expenses)}</td>
                      <td className={`font-semibold ${profitColor(t.profit)}`}>{formatMoney(t.profit)}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
