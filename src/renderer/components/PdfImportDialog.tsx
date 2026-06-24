import { useState, useRef } from 'react'

const api = () => window.api

interface RecognizedItem {
  name: string
  qty: number
  price_per_unit: number
  unit: string
  // Результат сопоставления
  matchedPart?: { id: number; name: string; unit: string; price_per_unit: number }
  matchedParts?: { id: number; name: string; unit: string; price_per_unit: number }[]
  action?: 'use_existing' | 'create_new' | 'skip'
  selectedPartId?: number
  // Редактируемые поля для создания новой
  editName?: string
  editUnit?: string
  editCategory?: string
  editQty?: number
  editPrice?: number
}

interface RecognizedSupplier {
  name: string
  inn: string
  // Результат поиска в БД
  existingOrg?: { id: number; name: string; inn: string }
  // Форма создания (если не найден)
  editName?: string
  editInn?: string
  orgId?: number // итоговый org_id после resolve
}

interface Props {
  onClose: () => void
  onImported: () => void
  parts: { id: number; name: string; unit: string; price_per_unit: number; category: string }[]
  categories: string[]
  units: string[]
}

type Step = 'upload' | 'recognizing' | 'supplier' | 'items' | 'confirm'

export function PdfImportDialog({ onClose, onImported, parts, categories, units }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState('')
  const [supplier, setSupplier] = useState<RecognizedSupplier | null>(null)
  const [items, setItems] = useState<RecognizedItem[]>([])
  const [currentItemIdx, setCurrentItemIdx] = useState(0)
  const [payStatus, setPayStatus] = useState<'paid' | 'debt'>('paid')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [fileName, setFileName] = useState('')

  // ── Шаг 1: загрузка и распознавание ──────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFileName(file.name)
    setError('')
    setStep('recognizing')

    try {
      // Конвертируем в base64
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = () => rej(new Error('Ошибка чтения файла'))
        r.readAsDataURL(file)
      })

      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      const mediaType = isPdf ? 'application/pdf' : 'image/jpeg'

      const data = await window.api.claude.recognize(base64, 'application/pdf')
      const text = data.content?.find((c: any) => c.type === 'text')?.text || ''
      // Вытаскиваем JSON из текста — ищем первый { ... }
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Claude не вернул JSON. Ответ: ' + text.slice(0, 200))
      const parsed = JSON.parse(match[0])

      // Ищем поставщика по ИНН в БД
      const orgs = await api().organizations.getAll({})
      const existingOrg = orgs.find((o: any) => o.inn && o.inn.trim() === (parsed.supplier?.inn || '').trim())

      const recognizedSupplier: RecognizedSupplier = {
        name: parsed.supplier?.name || '',
        inn: parsed.supplier?.inn || '',
        existingOrg: existingOrg || undefined,
        editName: parsed.supplier?.name || '',
        editInn: parsed.supplier?.inn || '',
        orgId: existingOrg?.id,
      }

      // Сопоставляем позиции с существующими запчастями
      const recognizedItems: RecognizedItem[] = (parsed.items || []).map((item: any) => {
        const nameLower = (item.name || '').toLowerCase()
        // Ищем похожие — совпадение по словам
        const words = nameLower.split(/\s+/).filter((w: string) => w.length > 3)
        const matched = parts.filter(p => {
          const pLower = p.name.toLowerCase()
          return words.some((w: string) => pLower.includes(w))
        })

        return {
          name: item.name || '',
          qty: item.qty || 1,
          price_per_unit: item.price_per_unit || 0,
          unit: item.unit || 'шт',
          matchedParts: matched,
          matchedPart: matched.length === 1 ? matched[0] : undefined,
          action: matched.length === 1 ? 'use_existing' : 'create_new',
          selectedPartId: matched.length === 1 ? matched[0].id : undefined,
          editName: item.name || '',
          editUnit: item.unit || 'шт',
          editCategory: categories[0] || '',
          editQty: item.qty || 1,
          editPrice: item.price_per_unit || 0,
        }
      })

      setSupplier(recognizedSupplier)
      setItems(recognizedItems)
      setStep('supplier')
    } catch (err: any) {
      setError('Ошибка распознавания: ' + err.message)
      setStep('upload')
    }
  }

  // ── Шаг 2: подтверждение поставщика ──────────────────────
  async function handleSupplierConfirm() {
    if (!supplier) return
    let orgId = supplier.orgId

    if (!orgId) {
      // Создаём новую организацию
      const result = await api().organizations.create({
        name: supplier.editName || supplier.name,
        inn: supplier.editInn || supplier.inn,
        type: 'supplier',
      })
      orgId = result.id
    }

    setSupplier({ ...supplier, orgId })
    setCurrentItemIdx(0)
    setStep('items')
  }

  // ── Шаг 3: обработка позиций ──────────────────────────────
  function updateItem(idx: number, patch: Partial<RecognizedItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  function handleItemNext() {
    if (currentItemIdx < items.length - 1) {
      setCurrentItemIdx(currentItemIdx + 1)
    } else {
      setStep('confirm')
    }
  }

  function handleItemBack() {
    if (currentItemIdx > 0) setCurrentItemIdx(currentItemIdx - 1)
    else setStep('supplier')
  }

  // ── Шаг 4: сохранение ─────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      for (const item of items) {
        if (item.action === 'skip') continue

        let partId: number

        if (item.action === 'use_existing' && item.selectedPartId) {
          partId = item.selectedPartId
        } else {
          // Создаём новую запчасть
          const res = await api().parts.create({
            name: item.editName || item.name,
            unit: item.editUnit || item.unit,
            qty_in_stock: 0,
            price_per_unit: item.editPrice || item.price_per_unit,
            category: item.editCategory || '',
          })
          partId = res.id
        }

        // Создаём приход на склад
        await api().parts.receipts.create({
          part_id: partId,
          date: receiptDate,
          qty: item.action === 'use_existing' ? item.qty : (item.editQty || item.qty),
          price_per_unit: item.action === 'use_existing' ? item.price_per_unit : (item.editPrice || item.price_per_unit),
          supplier: supplier?.editName || supplier?.name || '',
          comment: `Импорт из счёта${fileName ? ': ' + fileName : ''}`,
        })
      }

      onImported()
      onClose()
    } catch (err: any) {
      setError('Ошибка сохранения: ' + err.message)
    }
    setSaving(false)
  }

  const currentItem = items[currentItemIdx]
  const activeItems = items.filter(it => it.action !== 'skip')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Заголовок */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Импорт из счёта / УПД</h2>
            <div className="flex items-center gap-2 mt-1">
              {(['upload', 'supplier', 'items', 'confirm'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s ? 'bg-primary-600 text-white' :
                    (['upload','supplier','items','confirm'].indexOf(step) > i) ? 'bg-green-500 text-white' :
                    'bg-slate-200 text-slate-400'
                  }`}>{i + 1}</div>
                  {i < 3 && <div className="w-6 h-px bg-slate-200" />}
                </div>
              ))}
              <span className="text-xs text-slate-400 ml-2">
                {step === 'upload' && 'Загрузка'}
                {step === 'recognizing' && 'Распознавание...'}
                {step === 'supplier' && 'Поставщик'}
                {step === 'items' && `Позиция ${currentItemIdx + 1} из ${items.length}`}
                {step === 'confirm' && 'Подтверждение'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5">

          {/* Ошибка */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">{error}</div>
          )}

          {/* ШАГ 1: Загрузка */}
          {(step === 'upload' || step === 'recognizing') && (
            <div className="space-y-4">
              <div
                onClick={() => step === 'upload' && fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  step === 'recognizing'
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50 cursor-pointer'
                }`}
              >
                {step === 'recognizing' ? (
                  <div className="space-y-3">
                    <div className="text-3xl animate-spin inline-block">⚙️</div>
                    <p className="font-semibold text-primary-700">Claude анализирует документ...</p>
                    <p className="text-sm text-slate-500">{fileName}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-4xl">📄</div>
                    <p className="font-semibold text-slate-700">Загрузите PDF счёт или УПД</p>
                    <p className="text-sm text-slate-400">Нажмите или перетащите файл</p>
                    <p className="text-xs text-slate-300">Поддерживаются PDF файлы</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
            </div>
          )}

          {/* ШАГ 2: Поставщик */}
          {step === 'supplier' && supplier && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Распознано из документа</p>
                <p className="font-medium text-slate-700">{supplier.name}</p>
                <p className="text-sm text-slate-500">ИНН: {supplier.inn || '—'}</p>
              </div>

              {supplier.existingOrg ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 font-bold">✓</span>
                    <span className="font-semibold text-green-800">Организация найдена в базе</span>
                  </div>
                  <p className="text-sm text-slate-700">{supplier.existingOrg.name}</p>
                  <p className="text-xs text-slate-500">ИНН: {supplier.existingOrg.inn}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                    <p className="text-sm font-medium text-yellow-800">⚠️ Организация не найдена — будет создана новая</p>
                    <p className="text-xs text-yellow-600 mt-0.5">Проверьте и при необходимости скорректируйте данные</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Название организации</label>
                      <input className="input" value={supplier.editName || ''}
                        onChange={e => setSupplier({ ...supplier, editName: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">ИНН</label>
                      <div className="flex gap-2">
                        <input className="input font-mono flex-1" value={supplier.editInn || ''}
                          onChange={e => setSupplier({ ...supplier, editInn: e.target.value })} />
                        <button className="btn-secondary text-xs px-2" onClick={async () => {
                          const orgs = await api().organizations.getAll({})
                          const found = orgs.find((o: any) => o.inn && o.inn.trim() === (supplier.editInn || '').trim())
                          if (found) setSupplier({ ...supplier, existingOrg: found, orgId: found.id })
                          else alert('Организация с таким ИНН не найдена в базе')
                        }}>🔍</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button className="btn-secondary" onClick={onClose}>Отмена</button>
                <button className="btn-primary" onClick={handleSupplierConfirm}>
                  Далее → Позиции ({items.length} шт.)
                </button>
              </div>
            </div>
          )}

          {/* ШАГ 3: Позиции */}
          {step === 'items' && currentItem && (
            <div className="space-y-4">
              {/* Прогресс по позициям */}
              <div className="flex gap-1.5">
                {items.map((it, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < currentItemIdx ? 'bg-green-400' :
                    i === currentItemIdx ? 'bg-primary-500' :
                    'bg-slate-200'
                  }`} />
                ))}
              </div>

              {/* Распознанная позиция */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">Из документа</p>
                <p className="font-semibold text-slate-800">{currentItem.name}</p>
                <div className="flex gap-4 mt-1 text-sm text-slate-500">
                  <span>Кол-во: <b>{currentItem.qty}</b> {currentItem.unit}</span>
                  <span>Цена: <b>{currentItem.price_per_unit.toLocaleString('ru-RU')} ₽</b></span>
                  <span>Сумма: <b>{(currentItem.qty * currentItem.price_per_unit).toLocaleString('ru-RU')} ₽</b></span>
                </div>
              </div>

              {/* Варианты действий */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-600">Что сделать с этой позицией?</p>

                {/* Совпадения в базе */}
                {(currentItem.matchedParts?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">Похожие в базе:</p>
                    {currentItem.matchedParts!.map(mp => (
                      <label key={mp.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                        currentItem.action === 'use_existing' && currentItem.selectedPartId === mp.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}>
                        <input type="radio" name={`item-${currentItemIdx}`} className="accent-primary-600"
                          checked={currentItem.action === 'use_existing' && currentItem.selectedPartId === mp.id}
                          onChange={() => updateItem(currentItemIdx, { action: 'use_existing', selectedPartId: mp.id })} />
                        <div className="flex-1">
                          <p className="font-medium text-sm text-slate-800">{mp.name}</p>
                          <p className="text-xs text-slate-400">{mp.unit} · {mp.price_per_unit.toLocaleString('ru-RU')} ₽/ед.</p>
                        </div>
                        <span className="badge badge-blue text-xs">Использовать</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Создать новую */}
                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  currentItem.action === 'create_new' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="radio" name={`item-${currentItemIdx}`} className="accent-green-600 mt-0.5"
                    checked={currentItem.action === 'create_new'}
                    onChange={() => updateItem(currentItemIdx, { action: 'create_new', selectedPartId: undefined })} />
                  <div className="flex-1 space-y-2">
                    <p className="font-medium text-sm text-slate-800">✨ Создать новую позицию</p>
                    {currentItem.action === 'create_new' && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="col-span-2">
                          <label className="label">Наименование</label>
                          <input className="input text-sm" value={currentItem.editName || ''}
                            onChange={e => updateItem(currentItemIdx, { editName: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Категория</label>
                          <select className="input text-sm" value={currentItem.editCategory || ''}
                            onChange={e => updateItem(currentItemIdx, { editCategory: e.target.value })}>
                            <option value="">— выберите —</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Единица</label>
                          <select className="input text-sm" value={currentItem.editUnit || 'шт'}
                            onChange={e => updateItem(currentItemIdx, { editUnit: e.target.value })}>
                            {units.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Количество</label>
                          <input type="number" className="input text-sm" value={currentItem.editQty ?? currentItem.qty}
                            onChange={e => updateItem(currentItemIdx, { editQty: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <label className="label">Цена за ед., ₽</label>
                          <input type="number" className="input text-sm" value={currentItem.editPrice ?? currentItem.price_per_unit}
                            onChange={e => updateItem(currentItemIdx, { editPrice: parseFloat(e.target.value) || 0 })} />
                        </div>
                      </div>
                    )}
                  </div>
                </label>

                {/* Пропустить */}
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  currentItem.action === 'skip' ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="radio" name={`item-${currentItemIdx}`} className="accent-slate-600"
                    checked={currentItem.action === 'skip'}
                    onChange={() => updateItem(currentItemIdx, { action: 'skip', selectedPartId: undefined })} />
                  <p className="text-sm text-slate-500">Пропустить эту позицию</p>
                </label>
              </div>

              <div className="flex justify-between pt-2">
                <button className="btn-secondary" onClick={handleItemBack}>← Назад</button>
                <button className="btn-primary" onClick={handleItemNext}
                  disabled={!currentItem.action}>
                  {currentItemIdx < items.length - 1 ? 'Следующая →' : 'К подтверждению →'}
                </button>
              </div>
            </div>
          )}

          {/* ШАГ 4: Подтверждение */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 space-y-1">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Поставщик</p>
                <p className="font-semibold text-slate-800">{supplier?.editName || supplier?.name}</p>
                {(supplier?.editInn || supplier?.inn) && (
                  <p className="text-sm text-slate-500">ИНН: {supplier?.editInn || supplier?.inn}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Дата поступления</label>
                  <input type="date" className="input" value={receiptDate}
                    onChange={e => setReceiptDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Статус оплаты</label>
                  <select className="input" value={payStatus}
                    onChange={e => setPayStatus(e.target.value as 'paid' | 'debt')}>
                    <option value="paid">✓ Оплачено</option>
                    <option value="debt">⏳ В долг</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-600">Итоговые позиции:</p>
                <div className="table-wrap max-h-52 overflow-y-auto">
                  <table className="table text-sm">
                    <thead>
                      <tr>
                        <th>Наименование</th>
                        <th className="text-center">Кол-во</th>
                        <th className="text-right">Цена</th>
                        <th className="text-right">Сумма</th>
                        <th>Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const name = it.action === 'use_existing'
                          ? parts.find(p => p.id === it.selectedPartId)?.name || it.name
                          : (it.editName || it.name)
                        const qty = it.action === 'use_existing' ? it.qty : (it.editQty || it.qty)
                        const price = it.action === 'use_existing' ? it.price_per_unit : (it.editPrice || it.price_per_unit)
                        return (
                          <tr key={i} className={it.action === 'skip' ? 'opacity-40' : ''}>
                            <td className="font-medium">{name}</td>
                            <td className="text-center">{qty}</td>
                            <td className="text-right">{price.toLocaleString('ru-RU')} ₽</td>
                            <td className="text-right font-semibold">{(qty * price).toLocaleString('ru-RU')} ₽</td>
                            <td>
                              {it.action === 'skip'
                                ? <span className="text-slate-400 text-xs">Пропуск</span>
                                : it.action === 'use_existing'
                                  ? <span className="badge badge-blue text-xs">Существующая</span>
                                  : <span className="badge badge-green text-xs">Новая</span>
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between text-sm px-1">
                  <span className="text-slate-500">Позиций к сохранению: <b>{activeItems.length}</b></span>
                  <span className="font-bold text-slate-800">
                    Итого: {activeItems.reduce((s, it) => {
                      const qty = it.action === 'use_existing' ? it.qty : (it.editQty || it.qty)
                      const price = it.action === 'use_existing' ? it.price_per_unit : (it.editPrice || it.price_per_unit)
                      return s + qty * price
                    }, 0).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button className="btn-secondary" onClick={() => { setCurrentItemIdx(items.length - 1); setStep('items') }}>
                  ← Изменить позиции
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={saving || activeItems.length === 0}>
                  {saving ? '⏳ Сохранение...' : `✓ Оприходовать ${activeItems.length} позиций`}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
