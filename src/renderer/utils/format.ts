// ─── Форматирование чисел ────────────────────────────────────────────────────

/** 1 234 567,50 руб. */
export function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' ₽'
}

/** 1 234 567 (без дробей) */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('ru-RU').format(value)
}

// ─── Форматирование дат ──────────────────────────────────────────────────────

/** 2025-04-15 → 15.04.2025 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Текущая дата в ISO: 2025-04-15 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Первый день текущего месяца: 2025-04-01 */
export function monthStartISO(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

/** Последний день текущего месяца: 2025-04-30 */
export function monthEndISO(date = new Date()): string {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  // Используем локальную дату чтобы избежать сдвига UTC
  const y = last.getFullYear()
  const m = String(last.getMonth() + 1).padStart(2, '0')
  const d = String(last.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** YYYY-MM → Апрель 2025 */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
}

/** Текущий месяц: 2025-04 */
export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Прочее ──────────────────────────────────────────────────────────────────

export function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const SHIFT_LABELS: Record<string, string> = {
  day:   'Дневная (08:00–20:00)',
  night: 'Ночная (20:00–08:00)',
}

export const PRICING_LABELS: Record<string, string> = {
  per_trip:    'За рейс',
  per_ton_km:  'За тонно-км',
}

export const EXPENSE_CATEGORIES = [
  'ТО', 'ГСМ', 'Запчасть', 'Шины', 'Страховка', 'Штраф', 'Прочее',
]
