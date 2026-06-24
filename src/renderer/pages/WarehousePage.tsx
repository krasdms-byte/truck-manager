import { useState, useEffect, useRef } from 'react'
import { OrgSelector } from '../components/OrgSelector'
import { PdfImportDialog } from '../components/PdfImportDialog'
import { formatMoney, formatNumber, formatDate, todayISO } from '../utils/format'

// Динамическая загрузка SheetJS
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

interface ImportRow {
  name: string; category: string; unit: string
  qty_in_stock: number; price_per_unit: number; supplier: string
  valid: boolean; error?: string
}

interface Part {
  id: number; name: string; unit: string
  qty_in_stock: number; price_per_unit: number
  category: string; supplier?: string; last_received_date?: string
}
interface Receipt {
  id: number; part_id: number; part_name: string; unit: string
  date: string; qty: number; price_per_unit: number; supplier?: string; comment?: string
}

const api = () => window.api

export function WarehousePage() {
  const [tab, setTab] = useState<'stock' | 'receipts'>('stock')
  const [items, setItems]           = useState<Part[]>([])
  const [receipts, setReceipts]     = useState<Receipt[]>([])
  const [writeoffs, setWriteoffs]     = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [units, setUnits]           = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [category, setCategory]     = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState<number | null>(null)
  const [showReceiptForm, setShowReceiptForm] = useState<number | null>(null) // part_id
  const [newCategory, setNewCategory] = useState('')
  const [showNewCat, setShowNewCat]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importRows, setImportRows]       = useState<ImportRow[]>([])
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importing, setImporting]         = useState(false)
  const [inStockOnly, setInStockOnly]     = useState(true)
  const [showPdfImport, setShowPdfImport]   = useState(false)

  const emptyForm = { name: '', unit: 'шт', qty_in_stock: '', price_per_unit: '', category: '', supplier: '' }
  const [form, setForm] = useState(emptyForm)
  const [receiptForm, setReceiptForm] = useState({ date: todayISO(), qty: '', price_per_unit: '', supplier: '', comment: '' })

  useEffect(() => {
    api().dict.categories.getAll().then((c: any[]) => setCategories(c.map((x: any) => x.name))).catch(() => setCategories([]))
    api().dict.units.getAll().then((u: any[]) => setUnits(u.map((x: any) => x.name))).catch(() => setUnits(['шт','л','кг']))
  }, [])

  useEffect(() => { loadAll() }, [search, category, inStockOnly])

  async function loadAll() {
    setLoading(true)
    const [parts, recs, wo] = await Promise.all([
      api().parts.getAll({ search: search || undefined, category: category || undefined, in_stock_only: inStockOnly }),
      api().parts.receipts.getAll(),
      api().expenses.getAll({}),
    ])
    setItems(parts); setReceipts(recs)
    setWriteoffs((wo as any[]).filter((e: any) => e.part_id))
    setLoading(false)
  }

  function openCreate() {
    setForm({ ...emptyForm, unit: units[0]||'шт', category: categories[0]||'' })
    setEditId(null); setShowForm(true)
  }

  function openEdit(p: Part) {
    setForm({ name: p.name, unit: p.unit, qty_in_stock: p.qty_in_stock.toString(), price_per_unit: p.price_per_unit.toString(), category: p.category, supplier: p.supplier||'' })
    setEditId(p.id); setShowForm(true)
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return
    await api().dict.categories.create(newCategory.trim())
    const cats = await api().dict.categories.getAll()
    setCategories(cats.map((c: any) => c.name))
    setForm({...form, category: newCategory.trim()})
    setNewCategory(''); setShowNewCat(false)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    const data = { ...form, qty_in_stock: 0, price_per_unit: parseFloat(form.price_per_unit)||0 }
    if (editId) {
      await api().parts.update(editId, { ...data, qty_in_stock: parseFloat(form.qty_in_stock)||0 })
    } else {
      const res = await api().parts.create(data)
      const qty = parseFloat(form.qty_in_stock) || 0
      if (qty > 0 && res.id) {
        await api().parts.receipts.create({
          part_id: res.id,
          date: new Date().toISOString().slice(0, 10),
          qty,
          price_per_unit: parseFloat(form.price_per_unit) || 0,
          supplier: form.supplier || '',
          comment: 'Начальный остаток',
        })
      }
    }
    setShowForm(false); setEditId(null); loadAll()
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить позицию со склада?\nИстория поступлений также будет удалена.')) return
    await api().parts.remove(id); loadAll()
  }

  async function handleReceipt() {
    if (!showReceiptForm || !receiptForm.qty || !receiptForm.price_per_unit) return
    const part = items.find(p => p.id === showReceiptForm)
    await api().parts.receipts.create({
      part_id: showReceiptForm,
      date: receiptForm.date,
      qty: parseFloat(receiptForm.qty),
      price_per_unit: parseFloat(receiptForm.price_per_unit),
      supplier: receiptForm.supplier || (part?.supplier || ''),
      comment: receiptForm.comment,
    })
    setShowReceiptForm(null)
    setReceiptForm({ date: todayISO(), qty: '', price_per_unit: '', supplier: '', comment: '' })
    loadAll()
  }

  async function handleDeleteReceipt(id: number) {
    if (!confirm('Удалить запись о поступлении?\nОстаток на складе будет уменьшен.')) return
    await api().parts.receipts.remove(id); loadAll()
  }

  // Скачать шаблон Excel
  async function handleDownloadTemplate() {
    try {
      const XLSX = await loadXLSX()
      const ws = XLSX.utils.aoa_to_sheet([
        ['Наименование', 'Категория', 'Единица', 'Остаток', 'Цена', 'Поставщик'],
        ['Фильтр масляный', 'Запчасть', 'шт', 10, 450, 'ООО Автозапчасти'],
        ['Дизельное топливо', 'ГСМ', 'л', 500, 62, ''],
        ['Тормозные колодки', 'Запчасть', 'компл', 4, 3200, ''],
      ])
      ws['!cols'] = [20,15,8,8,10,20].map(w => ({ wch: w }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Склад')
      XLSX.writeFile(wb, 'склад_шаблон.xlsx')
    } catch (err: any) {
      alert('Ошибка: ' + err.message)
    }
  }

  // Импорт Excel
  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const XLSX = await loadXLSX()
      const data = await file.arrayBuffer()
      const wb   = XLSX.read(data, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      // Нормализуем заголовки: убираем пробелы, приводим к нижнему регистру
      const COL_MAP: Record<string, string> = {
        'наименование': 'name', 'название': 'name', 'name': 'name',
        'категория': 'category', 'category': 'category',
        'единица': 'unit', 'ед': 'unit', 'ед.': 'unit', 'unit': 'unit',
        'остаток': 'qty_in_stock', 'количество': 'qty_in_stock', 'qty': 'qty_in_stock', 'кол-во': 'qty_in_stock',
        'цена': 'price_per_unit', 'цена за ед': 'price_per_unit', 'price': 'price_per_unit',
        'поставщик': 'supplier', 'продавец': 'supplier', 'supplier': 'supplier',
      }

      const parsed: ImportRow[] = rows.map((row, i) => {
        const norm: any = {}
        for (const [k, v] of Object.entries(row)) {
          const key = k.toLowerCase().trim()
          const mapped = COL_MAP[key]
          if (mapped) norm[mapped] = v
        }
        const name = String(norm.name || '').trim()
        if (!name) return { name: '', category: '', unit: 'шт', qty_in_stock: 0, price_per_unit: 0, supplier: '', valid: false, error: `Строка ${i+2}: пустое наименование` }
        return {
          name,
          category:       String(norm.category || '').trim(),
          unit:           String(norm.unit || 'шт').trim() || 'шт',
          qty_in_stock:   parseFloat(norm.qty_in_stock) || 0,
          price_per_unit: parseFloat(norm.price_per_unit) || 0,
          supplier:       String(norm.supplier || '').trim(),
          valid: true,
        }
      }).filter(r => r.name || !r.valid)

      if (parsed.length === 0) {
        alert('Файл пустой или не содержит данных.\n\nОжидаемые колонки: Наименование, Категория, Единица, Остаток, Цена')
        return
      }
      setImportRows(parsed)
      setShowImportPreview(true)
    } catch (err: any) {
      alert('Ошибка чтения файла: ' + err.message)
    }
  }

  async function handleImportConfirm() {
    setImporting(true)
    const validRows = importRows.filter(r => r.valid)
    let imported = 0
    for (const row of validRows) {
      try {
        // Ищем существующую позицию по имени
        const existing = items.find(p => p.name.toLowerCase() === row.name.toLowerCase())
        if (existing) {
          await api().parts.update(existing.id, {
            category: row.category || existing.category,
            unit: row.unit || existing.unit,
            qty_in_stock: row.qty_in_stock,
            price_per_unit: row.price_per_unit || existing.price_per_unit,
            supplier: row.supplier || existing.supplier,
          })
        } else {
          await api().parts.create(row)
        }
        imported++
      } catch {}
    }
    setShowImportPreview(false)
    setImportRows([])
    setImporting(false)
    await loadAll()
    alert(`Импорт завершён: ${imported} из ${validRows.length} позиций`)
  }

  const totalValue = items.reduce((s, p) => s + p.qty_in_stock * p.price_per_unit, 0)
  const lowStock   = items.filter(p => p.qty_in_stock <= 0).length

  return (
    <>
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Склад запчастей</h1>
          <p className="text-sm text-slate-500">
            Позиций: <span className="font-semibold">{items.length}</span>
            {' · '}Стоимость: <span className="font-semibold text-primary-600">{formatMoney(totalValue)}</span>
            {lowStock > 0 && <span className="text-red-500 ml-2">⚠️ {lowStock} на нуле</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['stock','receipts'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {t === 'stock' ? '📦 Остатки' : '📋 История движения'}
              </button>
            ))}
          </div>
          {tab === 'stock' && <>
            <input className="input w-44" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input w-36" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Все категории</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button onClick={() => setInStockOnly(true)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${inStockOnly ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                В наличии
              </button>
              <button onClick={() => setInStockOnly(false)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${!inStockOnly ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                Весь склад
              </button>
            </div>
            <button className="btn-secondary" onClick={handleDownloadTemplate} title="Скачать шаблон для заполнения">📄 Шаблон</button>
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}>📥 Excel</button>
            <button className="btn-secondary" onClick={() => setShowPdfImport(true)}>🤖 Импорт счёта</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
            <button className="btn-primary" onClick={openCreate}>+ Добавить</button>
          </>}
        </div>
      </div>

      {/* Форма добавления/редактирования позиции */}
      {showForm && (
        <div className="card card-body space-y-4 border-2 border-primary-200">
          <h3 className="font-semibold text-slate-700">{editId ? 'Редактировать позицию' : 'Новая позиция'}</h3>
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-2">
              <label className="label">Наименование *</label>
              <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} autoFocus />
            </div>
            <div>
              <label className="label">Категория</label>
              {showNewCat ? (
                <div className="flex gap-1">
                  <input className="input flex-1" placeholder="Новая..." value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
                  <button className="btn-primary px-2 text-xs" onClick={handleAddCategory}>+</button>
                  <button className="btn-secondary px-2 text-xs" onClick={() => setShowNewCat(false)}>✕</button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select className="input flex-1" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    <option value="">— выберите —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="btn-secondary px-2 text-xs" onClick={() => setShowNewCat(true)} title="Добавить категорию">+</button>
                </div>
              )}
            </div>
            <div>
              <label className="label">Единица</label>
              <select className="input" value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Остаток</label>
              <input type="number" className="input" value={form.qty_in_stock} onChange={e => setForm({...form, qty_in_stock: e.target.value})} />
            </div>
            <div>
              <label className="label">Цена за ед., ₽</label>
              <input type="number" className="input" value={form.price_per_unit} onChange={e => setForm({...form, price_per_unit: e.target.value})} />
            </div>
            <div className="col-span-2">
              <OrgSelector
                label="Продавец / Поставщик"
                value={form.supplier || ''}
                onChange={(orgName, id) => setForm({...form, supplier: orgName})}
                placeholder="— не указан —"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditId(null) }}>Отмена</button>
            <button className="btn-primary" onClick={handleSave}>{editId ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </div>
      )}

      {/* Форма поступления */}
      {showReceiptForm && (
        <div className="card card-body space-y-4 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">
              Поступление: {items.find(p => p.id === showReceiptForm)?.name}
            </h3>
            <button className="btn-ghost text-xs" onClick={() => setShowReceiptForm(null)}>✕</button>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <div>
              <label className="label">Дата</label>
              <input type="date" className="input" value={receiptForm.date} onChange={e => setReceiptForm({...receiptForm, date: e.target.value})} />
            </div>
            <div>
              <label className="label">Количество *</label>
              <input type="number" className="input" value={receiptForm.qty} onChange={e => setReceiptForm({...receiptForm, qty: e.target.value})} autoFocus />
            </div>
            <div>
              <label className="label">Цена за ед., ₽ *</label>
              <input type="number" className="input" value={receiptForm.price_per_unit} onChange={e => setReceiptForm({...receiptForm, price_per_unit: e.target.value})} />
            </div>
            <div>
              <label className="label">Продавец</label>
              <input className="input" placeholder="Откуда куплено..." value={receiptForm.supplier} onChange={e => setReceiptForm({...receiptForm, supplier: e.target.value})} />
            </div>
            <div>
              <label className="label">Примечание</label>
              <input className="input" value={receiptForm.comment} onChange={e => setReceiptForm({...receiptForm, comment: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setShowReceiptForm(null)}>Отмена</button>
            <button className="btn-primary" onClick={handleReceipt}>✓ Оприходовать</button>
          </div>
        </div>
      )}

      {/* Превью импорта Excel */}
      {showImportPreview && (
        <div className="card card-body space-y-4 border-2 border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-700">Превью импорта Excel</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Найдено строк: {importRows.length} · Валидных: {importRows.filter(r => r.valid).length}
                {importRows.some(r => !r.valid) && <span className="text-red-500 ml-2">· Ошибок: {importRows.filter(r => !r.valid).length}</span>}
              </p>
            </div>
            <button className="btn-ghost text-xs" onClick={() => { setShowImportPreview(false); setImportRows([]) }}>✕ Отмена</button>
          </div>
          <div className="table-wrap max-h-64 overflow-y-auto">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Наименование</th><th>Категория</th><th>Ед.</th>
                  <th className="text-center">Остаток</th><th className="text-right">Цена</th>
                  <th>Поставщик</th><th></th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((r, i) => (
                  <tr key={i} className={!r.valid ? "bg-red-50" : ""}>
                    {r.valid ? <>
                      <td className="font-medium">{r.name}</td>
                      <td>{r.category || "—"}</td>
                      <td>{r.unit}</td>
                      <td className="text-center">{r.qty_in_stock}</td>
                      <td className="text-right">{formatMoney(r.price_per_unit)}</td>
                      <td className="text-slate-400">{r.supplier || "—"}</td>
                      <td><span className="text-green-600 text-xs">✓</span></td>
                    </> : <>
                      <td colSpan={6} className="text-red-500">{r.error}</td>
                      <td><span className="text-red-500 text-xs">✕</span></td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => { setShowImportPreview(false); setImportRows([]) }}>Отмена</button>
            <button className="btn-primary" onClick={handleImportConfirm} disabled={importing}>
              {importing ? "⏳ Импорт..." : `✓ Импортировать ${importRows.filter(r => r.valid).length} позиций`}
            </button>
          </div>
        </div>
      )}

      {/* ВКЛАДКА: ОСТАТКИ */}
      {tab === 'stock' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Наименование</th><th>Категория</th>
                <th className="text-center">Остаток</th><th>Ед.</th>
                <th className="text-right">Цена</th><th className="text-right">Сумма</th>
                <th>Поставщик</th><th>Последнее поступление</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
                : items.length === 0
                  ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">{search||category ? 'Ничего не найдено' : 'Склад пуст'}</td></tr>
                  : items.map(p => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td><span className="badge badge-gray">{p.category}</span></td>
                      <td className="text-center">
                        <span className={p.qty_in_stock <= 0 ? 'text-red-600 font-bold' : p.qty_in_stock <= 3 ? 'text-yellow-600 font-medium' : 'text-slate-700'}>
                          {formatNumber(p.qty_in_stock)}
                        </span>
                      </td>
                      <td className="text-slate-500">{p.unit}</td>
                      <td className="text-right">{formatMoney(p.price_per_unit)}</td>
                      <td className="text-right font-medium">{formatMoney(p.qty_in_stock * p.price_per_unit)}</td>
                      <td className="text-xs text-slate-500">{p.supplier || '—'}</td>
                      <td className="text-xs text-slate-500">{p.last_received_date ? formatDate(p.last_received_date) : '—'}</td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => { setShowReceiptForm(p.id); setReceiptForm({date: todayISO(), qty: '', price_per_unit: p.price_per_unit.toString(), supplier: p.supplier||'', comment: ''}) }}
                            className="text-slate-400 hover:text-green-600 text-sm px-1.5 py-0.5 rounded hover:bg-green-50" title="Оприходовать поступление">+</button>
                          <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-primary-600 text-sm px-1.5 py-0.5 rounded hover:bg-primary-50">✏️</button>
                          <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-600 text-sm px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ВКЛАДКА: ИСТОРИЯ ПОСТУПЛЕНИЙ */}
      {tab === 'receipts' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th><th>Тип</th><th>Наименование</th>
                <th className="text-center">Кол-во</th><th>Ед.</th>
                <th className="text-right">Цена</th><th className="text-right">Сумма</th>
                <th>Поставщик / Техника</th><th>Примечание</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={10} className="text-center py-8 text-slate-400">Загрузка...</td></tr>
                : (() => {
                    const combined = [
                      ...receipts.map(r => ({ ...r, _type: 'in' as const, _date: r.date })),
                      ...writeoffs.map(e => ({ ...e, _type: 'out' as const, _date: e.date, part_name: e.name, qty: e.qty, price_per_unit: e.price_per_unit })),
                    ].sort((a, b) => b._date.localeCompare(a._date))
                    if (combined.length === 0) return <tr><td colSpan={10} className="text-center py-8 text-slate-400">Движений пока нет</td></tr>
                    return combined.map((r, i) => (
                      <tr key={r._type + r.id + i} className={r._type === 'out' ? 'bg-red-50/30' : 'bg-green-50/20'}>
                        <td className="whitespace-nowrap">{formatDate(r._date)}</td>
                        <td>
                          {r._type === 'in'
                            ? <span className="badge badge-green text-xs">📥 Приход</span>
                            : <span className="badge badge-red text-xs">📤 Списание</span>}
                        </td>
                        <td className="font-medium">{r.part_name}</td>
                        <td className={`text-center font-medium ${r._type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                          {r._type === 'in' ? '+' : '-'}{formatNumber(r.qty)}
                        </td>
                        <td className="text-slate-500">{r.unit}</td>
                        <td className="text-right">{formatMoney(r.price_per_unit)}</td>
                        <td className="text-right font-medium">{formatMoney(r.qty * r.price_per_unit)}</td>
                        <td className="text-xs text-slate-500">
                          {r._type === 'in' ? (r.supplier || '—') : (r.truck_plate || '—')}
                        </td>
                        <td className="text-xs text-slate-400">{r.comment || r.part_name || '—'}</td>
                        <td>
                          {r._type === 'in' && (
                            <button onClick={() => handleDeleteReceipt(r.id)}
                              className="text-slate-400 hover:text-red-600 text-sm px-1.5 py-0.5 rounded hover:bg-red-50">🗑️</button>
                          )}
                        </td>
                      </tr>
                    ))
                  })()
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
      {showPdfImport && (
        <PdfImportDialog
          onClose={() => setShowPdfImport(false)}
          onImported={() => { setShowPdfImport(false); loadAll() }}
          parts={items}
          categories={categories}
          units={units}
        />
      )}
    </>
  )
}
