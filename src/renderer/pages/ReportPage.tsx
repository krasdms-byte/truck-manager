import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer
} from 'recharts'
import { formatMoney, formatMonth, monthStartISO, monthEndISO, currentMonth } from '../utils/format'

const api = () => window.api

interface Project { id: number; name: string; client_name?: string }
interface TruckReport { truck_id: number; plate: string; model?: string; income: number; expenses: number; profit: number }
interface DriverReport { id: number; full_name: string; shifts_count: number; trips_amount: number }
interface MonthlyData { month: string; label: string; income: number; expenses: number; profit: number }

const COLORS = ['#2e75b6','#22c55e','#ef4444','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#84cc16']

const fmt = (v: number) => `${(v/1000).toFixed(0)}к ₽`

export function ReportPage() {
  const [projects, setProjects]   = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [mode, setMode]           = useState<'month' | 'range'>('month')
  const [month, setMonth]         = useState(currentMonth())
  const [dateFrom, setDateFrom]   = useState(monthStartISO(new Date()))
  const [dateTo, setDateTo]       = useState(monthEndISO(new Date()))
  const [year, setYear]           = useState(new Date().getFullYear())

  const [kpi, setKpi]           = useState<any>(null)
  const [byTruck, setByTruck]   = useState<TruckReport[]>([])
  const [byDriver, setByDriver] = useState<DriverReport[]>([])
  const [monthly, setMonthly]   = useState<MonthlyData[]>([])
  const [projectStats, setProjectStats] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [debts, setDebts]       = useState<any[]>([])
  const [projOrgSummary, setProjOrgSummary] = useState<any[]>([])

  useEffect(() => {
    api().projects.getAll({}).then(setProjects)
  }, [])

  useEffect(() => { loadData() }, [month, dateFrom, dateTo, mode, projectId, year])

  function getRange() {
    if (mode === 'month') {
      return { from: monthStartISO(new Date(month + '-01')), to: monthEndISO(new Date(month + '-01')) }
    }
    return { from: dateFrom, to: dateTo }
  }

  async function loadData() {
    setLoading(true)
    const { from, to } = getRange()
    try {
      const [kpiData, truckData, driverData, monthlyData, debtsData, projOrgData] = await Promise.all([
        api().reports.getSummary({ from, to }),
        api().reports.getByTruck({ from, to }),
        api().reports.getByDriver({ from, to }),
        api().reports.getMonthly(year),
        api().reports.getDebts({ from, to }),
        api().reports.getProjectOrgSummary({ from, to }),
      ])
      setKpi(kpiData)
      setByTruck(truckData)
      setByDriver(driverData)
      setMonthly(monthlyData)
      setDebts(Array.isArray(debtsData) ? debtsData : [])
      setProjOrgSummary(Array.isArray(projOrgData) ? projOrgData : [])

      // Статистика по проектам
      const projStats = await Promise.all(
        (projects as Project[]).map(async (p: Project) => {
          const s = await api().projects.getSummary(p.id, { from, to })
          return { ...p, ...s }
        })
      )
      setProjectStats(projStats.filter((p: any) => p.trips_count > 0 || p.income > 0))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const profitColor = (v: number) => v >= 0 ? 'text-green-600' : 'text-red-600'

  // Данные для кругового графика расходов по техникаам
  const truckExpensePie = byTruck.filter(t => t.expenses > 0).map(t => ({ name: t.plate, value: t.expenses }))

  // Данные для графика доходов по проектам
  const projectIncomePie = projectStats.filter((p: any) => p.income > 0).map((p: any) => ({ name: p.name, value: p.income }))

  const periodLabel = mode === 'month' ? formatMonth(month) : `${dateFrom} — ${dateTo}`

  return (
    <div className="space-y-6">
      {/* Заголовок и фильтры */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Сводный отчёт</h1>
          <p className="text-sm text-slate-500">{periodLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {/* Режим периода */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['month', 'range'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${mode === m ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {m === 'month' ? 'Месяц' : 'Период'}
              </button>
            ))}
          </div>

          {mode === 'month'
            ? <input type="month" className="input w-40" value={month} onChange={e => setMonth(e.target.value)} />
            : <>
                <input type="date" className="input w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-slate-400 self-center">—</span>
                <input type="date" className="input w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </>
          }

          <select className="input w-48" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">Все проекты</option>
            {projects.map((p: Project) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <button className="btn-secondary" onClick={() => window.print()}>🖨 PDF</button>
        </div>
      </div>

      {/* KPI карточки */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Доходы',  value: kpi?.income,   color: 'text-green-600',   icon: '💰' },
          { label: 'Расходы', value: kpi?.expenses,  color: 'text-red-600',    icon: '🔧' },
          { label: 'Прибыль', value: kpi?.profit,    color: kpi ? profitColor(kpi.profit) : '', icon: '📈' },
          { label: 'Техники активной', value: null, color: 'text-primary-600', icon: '🚛' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="card p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>
              {loading ? '—' : value !== null ? formatMoney(value) : kpi?.trucks ?? '—'}
            </div>
          </div>
        ))}
      </div>

      {/* График по месяцам */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">Доходы / Расходы / Прибыль по месяцам {year}</h2>
          <select className="input w-24 text-sm" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly} margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmt} />
              <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income"   name="Доходы"  fill="#22c55e" radius={[3,3,0,0]} />
              <Bar dataKey="expenses" name="Расходы" fill="#ef4444" radius={[3,3,0,0]} />
              <Bar dataKey="profit"   name="Прибыль" fill="#2e75b6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Проекты + круговой */}
      <div className="grid grid-cols-2 gap-5">
        {/* По проектам */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-700">По проектам</h2></div>
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead><tr><th>Проект</th><th className="text-right">Доходы</th><th className="text-right">Рейсов</th><th className="text-right">Прибыль</th></tr></thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={4} className="text-center py-6 text-slate-400">Загрузка...</td></tr>
                  : projectStats.length === 0
                    ? <tr><td colSpan={4} className="text-center py-6 text-slate-400">Нет данных за период</td></tr>
                    : projectStats.map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          <div className="font-medium text-sm">{p.name}</div>
                          {p.client_name && <div className="text-xs text-slate-400">{p.client_name}</div>}
                        </td>
                        <td className="text-right text-green-600 font-medium">{formatMoney(p.income)}</td>
                        <td className="text-right">{p.trips_count}</td>
                        <td className={`text-right font-semibold ${profitColor(p.income - (p.expenses||0))}`}>
                          {formatMoney(p.income - (p.expenses||0))}
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Круговой — доходы по проектам */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-700">Доходы по проектам</h2></div>
          <div className="card-body flex items-center justify-center">
            {projectIncomePie.length === 0
              ? <p className="text-slate-400 text-sm">Нет данных</p>
              : <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={projectIncomePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                      {projectIncomePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend formatter={(name, entry: any) => `${name} — ${formatMoney(entry.payload.value)}`} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
            }
          </div>
        </div>
      </div>

      {/* По технике */}
      <div className="grid grid-cols-2 gap-5">
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-700">По технике</h2></div>
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead><tr><th>Техника</th><th className="text-right">Доходы</th><th className="text-right">Расходы</th><th className="text-right">Прибыль</th></tr></thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={4} className="text-center py-6 text-slate-400">Загрузка...</td></tr>
                  : byTruck.length === 0
                    ? <tr><td colSpan={4} className="text-center py-6 text-slate-400">Нет данных</td></tr>
                    : byTruck.map(t => (
                      <tr key={t.truck_id}>
                        <td className="font-medium">{t.plate} {t.model ? <span className="text-slate-400 text-xs">({t.model})</span> : ''}</td>
                        <td className="text-right text-green-600">{formatMoney(t.income)}</td>
                        <td className="text-right text-red-600">{formatMoney(t.expenses)}</td>
                        <td className={`text-right font-semibold ${profitColor(t.profit)}`}>{formatMoney(t.profit)}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Круговой — расходы по техникаам */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-slate-700">Расходы по технике</h2></div>
          <div className="card-body flex items-center justify-center">
            {truckExpensePie.length === 0
              ? <p className="text-slate-400 text-sm">Нет расходов за период</p>
              : <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={truckExpensePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                      {truckExpensePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Legend formatter={(name, entry: any) => `${name} — ${formatMoney(entry.payload.value)}`} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
            }
          </div>
        </div>
      </div>

      {/* ─── ДОЛГИ ─── */}
      {debts.length > 0 && (
        <div className="card border-l-4 border-orange-400">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-700">⏳ Неоплаченные долги</h2>
              <p className="text-xs text-slate-400 mt-0.5">Расходы со статусом "В долг" за период</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-orange-600">
                {formatMoney(debts.reduce((s: number, d: any) => s + d.total_debt, 0))}
              </div>
              <div className="text-xs text-slate-400">всего долг</div>
            </div>
          </div>
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Организация</th>
                  <th>ИНН</th>
                  <th className="text-center">Позиций</th>
                  <th className="text-right">Сумма долга</th>
                  <th>Расшифровка</th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d: any) => (
                  <tr key={d.org_id} className="bg-orange-50/30">
                    <td className="font-medium">{d.org_name}</td>
                    <td className="text-xs text-slate-400 font-mono">{d.inn || '—'}</td>
                    <td className="text-center">{d.items_count}</td>
                    <td className="text-right font-bold text-orange-600">{formatMoney(d.total_debt)}</td>
                    <td className="text-xs text-slate-500 max-w-xs truncate" title={d.items_list}>
                      {d.items_list}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── СВОДКА ПО ПРОЕКТАМ + ОРГАНИЗАЦИЯМ ─── */}
      {projOrgSummary.filter((p: any) => p.trips_amount > 0 || p.paid_amount > 0).length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-slate-700">Сводка по проектам: выполнено / оплачено / долг</h2>
            <p className="text-xs text-slate-400 mt-0.5">Сколько выполнили работ, сколько получили оплату и какой долг от клиента</p>
          </div>
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Проект</th>
                  <th>Клиент</th>
                  <th className="text-right">Выручка (рейсы)</th>
                  <th className="text-right">Поступления</th>
                  <th className="text-right">Расходы</th>
                  <th className="text-right">Прибыль</th>
                  <th className="text-right">Остаток к оплате</th>
                  <th className="text-right">Долг</th>
                </tr>
              </thead>
              <tbody>
                {projOrgSummary
                  .filter((p: any) => p.trips_amount > 0 || p.paid_amount > 0)
                  .map((p: any) => {
                    const balance = p.paid_amount - p.trips_amount
                    const profit = p.trips_amount - (p.expenses_amount || 0)
                    const hasDebt = p.client_debt > 0 || p.acc_debt > 0
                    return (
                      <tr key={p.id} className={hasDebt ? 'bg-orange-50/20' : ''}>
                        <td className="font-medium">{p.name}</td>
                        <td className="text-sm text-slate-500">{p.client_name || '—'}</td>
                        <td className="text-right font-medium text-slate-700">{formatMoney(p.trips_amount)}</td>
                        <td className="text-right text-green-600 font-medium">{formatMoney(p.paid_amount)}</td>
                        <td className="text-right text-red-600 font-medium">{formatMoney(p.expenses_amount || 0)}</td>
                        <td className={`text-right font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatMoney(profit)}</td>
                        <td className={`text-right font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {balance >= 0
                            ? <span className="text-green-600">+{formatMoney(balance)}</span>
                            : <span className="text-red-600">{formatMoney(balance)}</span>
                          }
                        </td>
                        <td className="text-right">
                          {(p.client_debt > 0 || p.acc_debt > 0)
                            ? <div className="space-y-0.5">
                                {p.client_debt > 0 && <div className="text-orange-600 font-semibold text-sm">⏳ {formatMoney(p.client_debt)}</div>}
                                {p.acc_debt > 0 && <div className="text-purple-600 font-semibold text-sm">🏠 {formatMoney(p.acc_debt)}</div>}
                              </div>
                            : <span className="text-slate-400 text-xs">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* По водителям */}
      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-slate-700">По водителям</h2></div>
        <div className="table-wrap rounded-none border-0">
          <table className="table">
            <thead><tr><th>Водитель</th><th className="text-center">Смен</th><th className="text-right">Выручка по рейсам</th></tr></thead>
            <tbody>
              {loading
                ? <tr><td colSpan={3} className="text-center py-6 text-slate-400">Загрузка...</td></tr>
                : byDriver.length === 0
                  ? <tr><td colSpan={3} className="text-center py-6 text-slate-400">Нет данных</td></tr>
                  : byDriver.map(d => (
                    <tr key={d.id}>
                      <td className="font-medium">{d.full_name}</td>
                      <td className="text-center">{d.shifts_count}</td>
                      <td className="text-right text-primary-600 font-medium">{formatMoney(d.trips_amount)}</td>
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
