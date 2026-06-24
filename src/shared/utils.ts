// ─── ФОРМАТИРОВАНИЕ ЧИСЕЛ И ДАТ ─────────────────────────────────────────────

/** 1 234 567,50 */
export function formatMoney(value: number | undefined | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** 1 234 */
export function formatNumber(value: number | undefined | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('ru-RU').format(value)
}

/** ISO → ДД.ММ.ГГГГ */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Date → YYYY-MM-DD */
export function toIsoDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/** YYYY-MM → Январь 2025 */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
}

/** Текущий месяц YYYY-MM */
export function currentMonth(): string {
  return toIsoDate().slice(0, 7)
}

/** Первый день месяца YYYY-MM → YYYY-MM-DD */
export function monthStart(ym: string): string {
  return `${ym}-01`
}

/** Последний день месяца */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${ym}-${String(last).padStart(2, '0')}`
}

// ─── КЛАССЫ ЦВЕТОВ ───────────────────────────────────────────────────────────

export function profitColor(value: number): string {
  if (value > 0) return 'text-green-600'
  if (value < 0) return 'text-red-600'
  return 'text-slate-500'
}

export function balanceColor(value: number): string {
  return value < 0 ? 'text-red-600 font-semibold' : 'text-green-600'
}

// ─── РАСЧЁТЫ ─────────────────────────────────────────────────────────────────

export function calcTripAmount(data: {
  pricing_mode: 'per_trip' | 'per_ton_km'
  trips_count: number
  price_per_trip?: number
  tons?: number
  distance_km?: number
  price_per_ton_km?: number
}): number {
  if (data.pricing_mode === 'per_trip') {
    return (data.trips_count || 0) * (data.price_per_trip || 0)
  }
  return (data.tons || 0) * (data.distance_km || 0) * (data.price_per_ton_km || 0) * (data.trips_count || 0)
}

// ─── ПРОЧЕЕ ──────────────────────────────────────────────────────────────────

export function shiftLabel(type: 'day' | 'night'): string {
  return type === 'day' ? 'Дневная' : 'Ночная'
}

export function roleLabel(role: 'driver' | 'mechanic'): string {
  return role === 'driver' ? 'Водитель' : 'Механик'
}

export function pricingLabel(mode: 'per_trip' | 'per_ton_km'): string {
  return mode === 'per_trip' ? 'За рейс' : 'Тонно-км'
}

export function clsx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
