import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { formatMoney, formatDate, monthStartISO, monthEndISO, currentMonth, formatMonth } from '../utils/format'
import { AccommodationSection } from '../components/AccommodationSection'

async function loadXLSX(): Promise<any> {
  if ((window as any).XLSX) return (window as any).XLSX
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    script.onload = () => resolve((window as any).XLSX)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function accDebtAmount(d: any): number {
  return d.actual_amount != null ? d.actual_amount : d.amount
}

function accDebtStatusLabel(d: any): string {
  if (d.debt_status === 'paid')   return 'Оплачено'
  if (d.debt_status === 'mutual') return 'Взаимозачёт'
  return 'В долг'
}

function accDebtStatusColor(d: any): string {
  if (d.debt_status === 'paid')   return 'green'
  if (d.debt_status === 'mutual') return 'blue'
  return 'orange'
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = parseInt(id!)

  const [project, setProject]   = useState<any>(null)
  const [summary, setSummary]   = useState<any>(null)
  const [trips, setTrips]       = useState<any[]>([])
  const [filterMode, setFilterMode] = useState<'all' | 'month' | 'range'>('all')
  const [month, setMonth]           = useState(currentMonth())
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [expenses, setExpenses]     = useState<any[]>([])
  const [accDebts, setAccDebts]     = useState<any[]>([])

  useEffect(() => {
    window.api.projects.getById(projectId).then(setProject)
  }, [projectId])

  useEffect(() => { loadData() }, [month, dateFrom, dateTo, filterMode, projectId])

  function getRange(): { from?: string; to?: string } {
    if (filterMode === 'all') return {}
    if (filterMode === 'month') {
      return { from: monthStartISO(new Date(month + '-01')), to: monthEndISO(new Date(month + '-01')) }
    }
    return { from: dateFrom || undefined, to: dateTo || undefined }
  }

  function filterAccDebts(debts: any[]): any[] {
    if (filterMode === 'all') return debts
    if (filterMode === 'month') return debts.filter(d => d.period_month === month)
    const fromM = dateFrom ? dateFrom.slice(0, 7) : ''
    const toM   = dateTo   ? dateTo.slice(0, 7)   : ''
    return debts.filter(d => (!fromM || d.period_month >= fromM) && (!toM || d.period_month <= toM))
  }

  async function loadData() {
    setLoading(true)
    const { from, to } = getRange()
    const [s, t, e, ad] = await Promise.all([
      window.api.projects.getSummary(projectId, { from, to }),
      window.api.trips.getAll({ from, to, project_id: projectId }),
      window.api.expenses.getAll(Object.assign({ project_id: projectId }, from ? { from } : {}, to ? { to } : {})),
      window.api.accommodation.getDebts(projectId),
    ])
    setSummary(s)
    setTrips(t)
    setExpenses(e || [])
    setAccDebts(ad || [])
    setLoading(false)
  }

  if (!project) return <div className="text-slate-400 p-8">Загрузка...</div>

  const STATUS_LABELS: Record<string, string> = { active: 'Активен', paused: 'Пауза', done: 'Завершён' }
  const STATUS_CLS: Record<string, string>    = { active: 'badge-green', paused: 'badge-yellow', done: 'badge-gray' }

  const periodLabel = filterMode === 'all' ? 'Весь период'
    : filterMode === 'month' ? formatMonth(month)
    : `${dateFrom || '...'} — ${dateTo || '...'}`

  const filteredAccDebts  = filterAccDebts(accDebts)
  const totalTrips        = trips.reduce((s, t) => s + t.amount, 0)

  // Расходы: разделяем на заказчика и остальных
  const clientExpenses    = expenses.filter((e: any) => e.debt_status === 'mutual')   // от заказчика в долг
  const otherExpenses     = expenses.filter((e: any) => e.debt_status !== 'mutual')   // от других поставщиков
  const mutualExp         = clientExpenses.reduce((s, e) => s + e.amount, 0)
  const otherExpPaid      = otherExpenses.filter((e: any) => e.debt_status === 'paid').reduce((s, e) => s + e.amount, 0)
  const otherExpDebt      = otherExpenses.filter((e: any) => e.debt_status === 'debt').reduce((s, e) => s + e.amount, 0)

  // Проживание: разделяем на заказчика и остальных
  const clientAccDebts    = filteredAccDebts.filter((d: any) => d.debt_status === 'mutual')
  const otherAccDebts     = filteredAccDebts.filter((d: any) => d.debt_status !== 'mutual')
  const clientAcc         = clientAccDebts.reduce((s, d) => s + accDebtAmount(d), 0)
  const otherAccDebt      = otherAccDebts.filter((d: any) => d.debt_status === 'debt').reduce((s, d) => s + accDebtAmount(d), 0)

  // Взаимозачёт = все расходы от заказчика (ГСМ + проживание от него)
  const totalMutual       = mutualExp + clientAcc

  // Итого по заказчику
  const clientNet         = totalTrips - totalMutual
  const income            = summary?.income || 0
  // Задолженность заказчика = Выручка − Взаимозачёт − Поступления
  const clientDebt        = totalTrips - totalMutual - income

  // Долг другим поставщикам
  const totalOtherDebt    = otherExpDebt + otherAccDebt

  // Группировка других поставщиков
  const supplierMap = new Map<string, { paid: number; debt: number }>()
  otherExpenses.forEach((e: any) => {
    const key = e.org_name || 'Без организации'
    const cur = supplierMap.get(key) || { paid: 0, debt: 0 }
    if (e.debt_status === 'paid') cur.paid += e.amount; else cur.debt += e.amount
    supplierMap.set(key, cur)
  })
  otherAccDebts.forEach((d: any) => {
    const key = d.org_name || 'Без организации'
    const cur = supplierMap.get(key) || { paid: 0, debt: 0 }
    if (d.debt_status === 'paid') cur.paid += accDebtAmount(d); else cur.debt += accDebtAmount(d)
    supplierMap.set(key, cur)
  })
  const supplierRows = Array.from(supplierMap.entries()).map(([name, v]) => ({ name, ...v }))

  async function handleExportExcel() {
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()

      const fmtDate = (iso: string) => { const [y,m,d] = iso.slice(0,10).split('-'); return `${d}.${m}.${y}` }

      // Лист 1: Рейсы
      const tripsRows = [
        ['Дата', 'Техника', 'Водитель', 'Смена', 'Рейсов', 'Тонн за рейс', 'Маршрут, км', 'Цена', 'Сумма, ₽'],
        ...trips.map((t: any) => [
          fmtDate(t.date), t.truck_plate || '', t.driver_name || '',
          t.shift_type === 'day' ? 'День' : 'Ночь', t.trips_count, t.tons || '', t.distance_km || '',
          t.pricing_mode === 'per_trip'
            ? (t.price_per_trip > 0 ? `${t.price_per_trip} ₽/рейс` : '')
            : (t.price_per_ton_km > 0 ? `${t.price_per_ton_km} ₽/т·км` : ''),
          t.amount,
        ]),
        [],
        ['', '', '', '', '', '', '', 'ИТОГО:', totalTrips],
      ]
      const wsTrips = XLSX.utils.aoa_to_sheet(tripsRows)
      wsTrips['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, wsTrips, 'Рейсы')

      // Лист 2: Расходы
      if (expenses.length > 0) {
        const expRows = [
          ['Дата', 'Категория', 'Наименование', 'Кол-во', 'Ед.', 'Цена/ед., ₽', 'Техника', 'Сумма, ₽', 'Организация', 'Статус'],
          ...expenses.map((e: any) => [
            fmtDate(e.date), e.category || '', e.name || '',
            e.qty || '', e.unit || '', e.price_per_unit || '',
            e.truck_plate || '', e.amount,
            e.org_name || '', e.debt_status === 'paid' ? 'Оплачено' : e.debt_status === 'mutual' ? 'Взаимозачёт' : 'В долг',
          ]),
          [],
          ['', '', '', '', '', '', 'ИТОГО:', expenses.reduce((s: number, e: any) => s + e.amount, 0), '', ''],
        ]
        const wsExp = XLSX.utils.aoa_to_sheet(expRows)
        wsExp['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 10 }]
        XLSX.utils.book_append_sheet(wb, wsExp, 'Расходы')
      }

      // Лист 3: Проживание и питание
      if (filteredAccDebts.length > 0) {
        const TYPE_LABEL: Record<string, string> = { accommodation: 'Проживание', meal: 'Питание' }
        const accRows = [
          ['Период', 'Тип', 'Организация', 'Сумма, ₽', 'Статус'],
          ...filteredAccDebts.map((d: any) => [
            d.period_month, TYPE_LABEL[d.type] || d.type,
            d.org_name || '—', accDebtAmount(d),
            accDebtStatusLabel(d),
          ]),
          [],
          ['', '', 'ИТОГО:', filteredAccDebts.reduce((s: number, d: any) => s + accDebtAmount(d), 0), ''],
        ]
        const wsAcc = XLSX.utils.aoa_to_sheet(accRows)
        wsAcc['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 10 }]
        XLSX.utils.book_append_sheet(wb, wsAcc, 'Проживание и питание')
      }

      // Лист 4: Сводка
      const summaryRows = [
        ['Отчёт по проекту', project.name],
        ['Клиент', project.client_name || ''],
        ['Период', periodLabel],
        [],
        ['Выручка по рейсам, ₽', totalTrips],
        ['Расходы от заказчика (взаимозачёт), ₽', mutualExp],
        ['Проживание и питание от заказчика, ₽', clientAcc],
        [],
        ['Итого (выручка − взаимозачёт), ₽', clientNet],
        ['Поступлений, ₽', income],
        ['Взаимозачёт с заказчиком, ₽', totalMutual],
        ['Задолженность заказчика, ₽', clientDebt],
        ['Долг другим поставщикам, ₽', totalOtherDebt],
        [],
        ['Всего рейсов', summary?.trips_count || 0],
        ['Техники на проекте', summary?.trucks?.length || 0],
      ]
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка')

      const filename = `отчёт_${project.name.replace(/\s+/g, '_')}_${periodLabel.replace(/\s+/g, '_')}.xlsx`
      XLSX.writeFile(wb, filename)
    } catch (err: any) {
      alert('Ошибка экспорта: ' + err.message)
    }
  }

  function handleExportPDF() {
    const debtExp    = totalOtherDebt
    const fmt        = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2 })
    const fmtD       = (iso: string) => { const [y,m,d] = iso.slice(0,10).split('-'); return `${d}.${m}.${y}` }
    const TYPE_LABEL: Record<string, string> = { accommodation: 'Проживание', meal: 'Питание' }

    const printContent = `
      <html><head><meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
        h1 { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
        .sub { color: #64748b; font-size: 13px; margin-bottom: 4px; }
        .period { color: #64748b; margin-bottom: 16px; font-size: 12px; }
        .kpi { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
        .kpi-card { background: #f1f5f9; border-radius: 8px; padding: 10px 16px; min-width: 120px; }
        .kpi-card.highlight { background: #dbeafe; }
        .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
        .kpi-value { font-size: 15px; font-weight: bold; color: #2563eb; }
        .kpi-value.green { color: #16a34a; }
        .kpi-value.red { color: #dc2626; }
        .kpi-value.orange { color: #ea580c; }
        h2 { font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        th { background: #1e3a5f; color: white; padding: 7px 9px; text-align: left; font-size: 10px; }
        td { padding: 6px 9px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .right { text-align: right; }
        .bold { font-weight: 600; }
        .blue { color: #2563eb; }
        .red { color: #dc2626; }
        .orange { color: #ea580c; }
        .green { color: #16a34a; }
        .total-row td { background: #1e3a5f !important; color: white; font-weight: bold; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${project.name}</h1>
      ${project.client_name ? `<div class="sub">${project.client_name}</div>` : ''}
      ${project.description ? `<div class="sub">${project.description}</div>` : ''}
      <div class="period">Период: ${periodLabel}</div>

      <h2 style="margin-top:8px">Сводная с заказчиком</h2>
      <div class="kpi">
        <div class="kpi-card">
          <div class="kpi-label">Выручка по рейсам</div>
          <div class="kpi-value">${fmt(totalTrips)} ₽</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Расходы от заказчика (в долг)</div>
          <div class="kpi-value red">${fmt(mutualExp)} ₽</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Проживание от заказчика</div>
          <div class="kpi-value orange">${fmt(clientAcc)} ₽</div>
        </div>
      </div>
      <div class="kpi">
        <div class="kpi-card highlight">
          <div class="kpi-label">Итого (выручка − взаимозачёт)</div>
          <div class="kpi-value ${clientNet >= 0 ? 'green' : 'red'}">${fmt(clientNet)} ₽</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Поступлений</div>
          <div class="kpi-value green">${fmt(income)} ₽</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Взаимозачёт с заказчиком</div>
          <div class="kpi-value blue">${fmt(totalMutual)} ₽</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Задолженность заказчика</div>
          <div class="kpi-value ${clientDebt <= 0 ? 'green' : 'red'}">${fmt(clientDebt)} ₽</div>
        </div>
      </div>
      ${supplierRows.length > 0 ? `
      <h2>Расчёты с другими поставщиками</h2>
      <table>
        <thead><tr><th>Поставщик</th><th class="right">Потрачено</th><th class="right">Оплачено</th><th class="right">В долг</th></tr></thead>
        <tbody>
          ${supplierRows.map((r: any) => `<tr>
            <td class="bold">${r.name}</td>
            <td class="right">${fmt(r.paid + r.debt)} ₽</td>
            <td class="right green">${r.paid > 0 ? fmt(r.paid) + ' ₽' : '—'}</td>
            <td class="right ${r.debt > 0 ? 'orange' : ''}">${r.debt > 0 ? fmt(r.debt) + ' ₽' : '—'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr class="total-row">
          <td>Задолженность по другим поставщикам</td>
          <td></td><td></td>
          <td class="right bold">${fmt(totalOtherDebt)} ₽</td>
        </tr></tfoot>
      </table>` : ''}
      <div class="kpi">
        <div class="kpi-card">
          <div class="kpi-label">Рейсов</div>
          <div class="kpi-value">${summary?.trips_count || 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Техники</div>
          <div class="kpi-value">${summary?.trucks?.length || 0}</div>
        </div>
      </div>

      ${trips.length > 0 ? `
      <h2>Рейсы</h2>
      <table>
        <thead><tr><th>Дата</th><th>Техника</th><th>Водитель</th><th>Смена</th><th class="right">Рейсов</th><th class="right">Тонн за рейс</th><th class="right">Маршрут, км</th><th class="right">Цена</th><th class="right">Сумма</th></tr></thead>
        <tbody>
          ${trips.map((t: any) => `<tr>
            <td>${fmtD(t.date)}</td>
            <td class="bold">${t.truck_plate || '—'}</td>
            <td>${t.driver_name || '—'}</td>
            <td>${t.shift_type === 'day' ? 'День' : 'Ночь'}</td>
            <td class="right">${t.trips_count}</td>
            <td class="right">${t.tons != null && t.tons > 0 ? t.tons : '—'}</td>
            <td class="right">${t.distance_km != null && t.distance_km > 0 ? t.distance_km : '—'}</td>
            <td class="right">${t.pricing_mode === 'per_trip' ? (t.price_per_trip > 0 ? fmt(t.price_per_trip) + ' ₽/рейс' : '—') : (t.price_per_ton_km > 0 ? fmt(t.price_per_ton_km) + ' ₽/т·км' : '—')}</td>
            <td class="right bold blue">${fmt(t.amount)} ₽</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td colspan="8" class="right bold">ИТОГО</td>
            <td class="right bold">${fmt(totalTrips)} ₽</td>
          </tr>
        </tbody>
      </table>` : ''}

      ${expenses.length > 0 ? `
      <h2>Запчасти, ремонт и ГСМ</h2>
      <table>
        <thead><tr><th>Дата</th><th>Категория</th><th>Наименование</th><th class="right">Кол-во</th><th>Ед.</th><th class="right">Цена/ед.</th><th>Техника</th><th class="right">Сумма</th><th>Организация</th><th>Статус</th></tr></thead>
        <tbody>
          ${expenses.map((e: any) => `<tr>
            <td>${fmtD(e.date)}</td>
            <td>${e.category || '—'}</td>
            <td>${e.name || '—'}</td>
            <td class="right">${e.qty != null ? e.qty : '—'}</td>
            <td>${e.unit || '—'}</td>
            <td class="right">${e.price_per_unit ? fmt(e.price_per_unit) + ' ₽' : '—'}</td>
            <td>${e.truck_plate || '—'}</td>
            <td class="right bold red">${fmt(e.amount)} ₽</td>
            <td>${e.org_name || '—'}</td>
            <td class="${e.debt_status === 'paid' ? 'green' : e.debt_status === 'mutual' ? 'blue' : 'orange'}">${e.debt_status === 'paid' ? 'Оплачено' : e.debt_status === 'mutual' ? 'Взаимозачёт' : 'В долг'}</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td colspan="7" class="right bold">ИТОГО</td>
            <td class="right bold">${fmt(expenses.reduce((s: number, e: any) => s + e.amount, 0))} ₽</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>` : ''}

      ${filteredAccDebts.length > 0 ? `
      <h2>Проживание и питание</h2>
      <table>
        <thead><tr><th>Период</th><th>Тип</th><th>Организация</th><th class="right">Сумма</th><th>Статус</th></tr></thead>
        <tbody>
          ${filteredAccDebts.map((d: any) => `<tr>
            <td>${d.period_month}</td>
            <td>${TYPE_LABEL[d.type] || d.type}</td>
            <td>${d.org_name || '—'}</td>
            <td class="right bold orange">${fmt(accDebtAmount(d))} ₽</td>
            <td class="${accDebtStatusColor(d)}">${accDebtStatusLabel(d)}</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td colspan="3" class="right bold">ИТОГО</td>
            <td class="right bold">${fmt(filteredAccDebts.reduce((s: number, d: any) => s + accDebtAmount(d), 0))} ₽</td>
            <td></td>
          </tr>
        </tbody>
      </table>` : ''}

      </body></html>`

    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Разрешите открытие всплывающих окон'); return }
    w.document.write(printContent)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => navigate('/projects')}>← Назад</button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">{project.name}</h1>
            <span className={`badge ${STATUS_CLS[project.status]}`}>{STATUS_LABELS[project.status]}</span>
          </div>
          {project.client_name && <p className="text-sm text-slate-500">{project.client_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-sm" onClick={handleExportExcel} title="Экспорт в Excel">
            📊 Excel
          </button>
          <button className="btn-secondary text-sm" onClick={handleExportPDF} title="Печать / PDF">
            🖨 PDF
          </button>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {([['all','Весь период'],['month','Месяц'],['range','Период']] as const).map(([m, l]) => (
              <button key={m} onClick={() => setFilterMode(m as any)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${filterMode === m ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          {filterMode === 'month' && (
            <input type="month" className="input w-40" value={month} onChange={e => setMonth(e.target.value)} />
          )}
          {filterMode === 'range' && (
            <div className="flex items-center gap-1">
              <input type="date" className="input w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-slate-400">—</span>
              <input type="date" className="input w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {project.description && (
        <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600">{project.description}</div>
      )}

      {/* ── Сводная с заказчиком ── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
        <h2 className="text-sm font-bold text-blue-800 uppercase tracking-wide">Сводная с заказчиком</h2>

        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Выручка по рейсам</div>
            <div className="text-lg font-bold text-primary-600">{loading ? '—' : formatMoney(totalTrips)}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Расходы (ГСМ/запчасти)</div>
            <div className="text-lg font-bold text-red-600">{loading ? '—' : formatMoney(mutualExp)}</div>
            <div className="text-xs text-slate-400">от заказчика, в долг</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Проживание и питание</div>
            <div className="text-lg font-bold text-orange-500">{loading ? '—' : formatMoney(clientAcc)}</div>
            <div className="text-xs text-slate-400">от заказчика</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className={`rounded-xl p-3 border ${clientNet >= 0 ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'}`}>
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Итого (выручка − расходы)</div>
            <div className={`text-lg font-bold ${clientNet >= 0 ? 'text-slate-800' : 'text-red-700'}`}>{loading ? '—' : formatMoney(clientNet)}</div>
            <div className="text-xs text-slate-400">{formatMoney(totalTrips)} − {formatMoney(totalMutual)}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Поступлений</div>
            <div className="text-lg font-bold text-green-600">{loading ? '—' : formatMoney(income)}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Взаимозачёт с заказчиком</div>
            <div className="text-lg font-bold text-blue-600">{loading ? '—' : formatMoney(totalMutual)}</div>
            <div className="text-xs text-slate-400">ГСМ {formatMoney(mutualExp)} + проживание {formatMoney(clientAcc)}</div>
          </div>
          <div className={`rounded-xl p-3 border ${clientDebt <= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Задолженность заказчика</div>
            <div className={`text-lg font-bold ${clientDebt <= 0 ? 'text-green-700' : 'text-red-700'}`}>{loading ? '—' : formatMoney(clientDebt)}</div>
            <div className="text-xs text-slate-400">Выручка − взаимозачёт − поступления</div>
          </div>
        </div>
      </div>

      {/* ── Расчёты с другими поставщиками ── */}
      <div className="rounded-xl border border-orange-200 bg-orange-50/30 p-4 space-y-3">
        <h2 className="text-sm font-bold text-orange-800 uppercase tracking-wide">Расчёты с другими поставщиками</h2>

        {supplierRows.length === 0 ? (
          <p className="text-sm text-slate-400">Расходов от других поставщиков нет</p>
        ) : (
          <div className="table-wrap rounded-lg">
            <table className="table">
              <thead>
                <tr>
                  <th>Поставщик</th>
                  <th className="text-right">Потрачено</th>
                  <th className="text-right">Оплачено</th>
                  <th className="text-right">В долг</th>
                </tr>
              </thead>
              <tbody>
                {supplierRows.map(r => (
                  <tr key={r.name}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-right">{formatMoney(r.paid + r.debt)}</td>
                    <td className="text-right text-green-600">{r.paid > 0 ? formatMoney(r.paid) : '—'}</td>
                    <td className="text-right font-semibold text-orange-600">{r.debt > 0 ? formatMoney(r.debt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold">
                  <td>Итого</td>
                  <td className="text-right">{formatMoney(supplierRows.reduce((s, r) => s + r.paid + r.debt, 0))}</td>
                  <td className="text-right text-green-700">{formatMoney(supplierRows.reduce((s, r) => s + r.paid, 0))}</td>
                  <td className="text-right text-orange-700">{formatMoney(totalOtherDebt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {totalOtherDebt > 0 && (
          <div className="flex justify-end">
            <div className="bg-orange-100 border border-orange-300 rounded-lg px-4 py-2 text-sm font-bold text-orange-800">
              Задолженность по другим поставщикам: {formatMoney(totalOtherDebt)}
            </div>
          </div>
        )}
      </div>

      {/* Счётчики */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Рейсов',  value: summary?.trips_count ?? '—',    color: 'text-slate-700' },
          { label: 'Техники', value: summary?.trucks?.length ?? '—', color: 'text-slate-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</div>
            <div className={`text-lg font-bold ${color}`}>{loading ? '—' : value}</div>
            <div className="text-xs text-slate-400">{periodLabel}</div>
          </div>
        ))}
      </div>

      {/* Техника на проекте */}
      {summary?.trucks?.length > 0 && (
        <div className="card card-body">
          <h3 className="font-semibold text-slate-700 mb-3">Техника на проекте в этом периоде</h3>
          <div className="flex flex-wrap gap-2">
            {summary.trucks.map((t: any) => (
              <span key={t.truck_id} className="badge badge-blue px-3 py-1.5 text-sm">
                🚛 {t.plate} {t.model ? `(${t.model})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Проживание и питание */}
      <AccommodationSection projectId={projectId} />

      {/* Расходы по проекту */}
      {expenses.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">🔧 Запчасти, ремонт и ГСМ</h3>
            <div className="flex gap-3 text-sm">
              <span className="text-slate-500">Всего: <span className="font-semibold text-red-600">{formatMoney(expenses.reduce((s: number, e: any) => s + e.amount, 0))}</span></span>
              {otherExpDebt > 0 && (
                <span className="text-orange-600 font-semibold">⏳ Долг поставщикам: {formatMoney(otherExpDebt)}</span>
              )}
            </div>
          </div>
          <div className="table-wrap rounded-none border-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th><th>Категория</th><th>Наименование</th><th className="text-right">Кол-во</th><th>Ед.</th><th className="text-right">Цена/ед.</th><th>Техника</th>
                  <th className="text-right">Сумма</th><th>Организация</th><th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e: any) => (
                  <tr key={e.id} className={e.debt_status === 'mutual' ? 'bg-blue-50/30' : e.debt_status === 'debt' ? 'bg-orange-50/30' : ''}>
                    <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                    <td><span className="badge badge-gray text-xs">{e.category}</span></td>
                    <td>{e.name}</td>
                    <td className="text-right text-slate-600">{e.qty != null ? e.qty : '—'}</td>
                    <td className="text-sm text-slate-500">{e.unit || '—'}</td>
                    <td className="text-right text-slate-600">{e.price_per_unit ? formatMoney(e.price_per_unit) : '—'}</td>
                    <td className="text-sm text-slate-500">{e.truck_plate || '—'}</td>
                    <td className="text-right font-semibold text-red-600">{formatMoney(e.amount)}</td>
                    <td className="text-sm text-slate-500">{e.org_name || '—'}</td>
                    <td>
                      {e.debt_status === 'paid'
                        ? <span className="text-green-600 text-xs font-medium">✓ Оплачено</span>
                        : e.debt_status === 'mutual'
                          ? <span className="text-blue-600 text-xs font-medium">⇄ Взаимозачёт</span>
                          : <span className="text-orange-600 text-xs font-medium">⏳ В долг</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Рейсы */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">
            Рейсы {filterMode === 'all' ? '(весь период)' : filterMode === 'month' ? `за ${formatMonth(month)}` : `${dateFrom||'...'} — ${dateTo||'...'}`}
          </h3>
          <button className="btn-primary text-xs"
            onClick={() => navigate(`/trips/add?project_id=${projectId}`)}>
            + Добавить рейс
          </button>
        </div>
        <div className="table-wrap rounded-none border-0">
          <table className="table">
            <thead>
              <tr><th>Дата</th><th>Самосвал</th><th>Водитель</th><th>Смена</th><th>Рейсов</th><th className="text-right">Тонн за рейс</th><th className="text-right">Длина маршрута, км</th><th className="text-right">Цена</th><th className="text-right">Сумма</th></tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
                : trips.length === 0
                  ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">Рейсов за период нет</td></tr>
                  : trips.map((t: any) => (
                    <tr key={t.id}>
                      <td>{formatDate(t.date)}</td>
                      <td className="font-medium">{t.truck_plate}</td>
                      <td>{t.driver_name}</td>
                      <td><span className={`badge ${t.shift_type === 'day' ? 'badge-yellow' : 'badge-blue'}`}>
                        {t.shift_type === 'day' ? '☀️' : '🌙'}
                      </span></td>
                      <td className="text-center">{t.trips_count}</td>
                      <td className="text-right text-slate-600">{t.tons > 0 ? t.tons : '—'}</td>
                      <td className="text-right text-slate-600">{t.distance_km > 0 ? t.distance_km : '—'}</td>
                      <td className="text-right text-slate-600">
                        {t.pricing_mode === 'per_trip'
                          ? (t.price_per_trip > 0 ? `${formatMoney(t.price_per_trip)} / рейс` : '—')
                          : (t.price_per_ton_km > 0 ? `${formatMoney(t.price_per_ton_km)} / т·км` : '—')}
                      </td>
                      <td className="text-right font-semibold text-primary-600">{formatMoney(t.amount)}</td>
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
