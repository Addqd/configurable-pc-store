import i18n from '../i18n'
import { ApiError } from '../api/transport'

export const PRODUCT_SORTS = [
  'created_desc', 'created_asc', 'updated_desc', 'updated_asc', 'name_asc', 'name_desc',
  'price_asc', 'price_desc', 'stock_asc', 'stock_desc', 'id_asc', 'id_desc',
] as const
export type AdminProductSort = (typeof PRODUCT_SORTS)[number]

export const USER_SORTS = [
  'created_desc', 'created_asc', 'username_asc', 'username_desc',
  'display_name_asc', 'display_name_desc', 'id_asc', 'id_desc',
] as const
export type AdminUserSort = (typeof USER_SORTS)[number]

export const REVIEW_SORTS = [
  'displayed_desc', 'displayed_asc', 'created_desc', 'created_asc',
  'rating_desc', 'rating_asc', 'id_desc', 'id_asc',
] as const
export type AdminReviewSort = (typeof REVIEW_SORTS)[number]

export const PRODUCT_STATS_SORTS = [
  'sold_units_desc', 'sold_units_asc', 'revenue_desc', 'revenue_asc',
  'rating_desc', 'rating_asc', 'review_count_desc', 'review_count_asc', 'name_asc', 'name_desc',
] as const
export type AdminProductStatsSort = (typeof PRODUCT_STATS_SORTS)[number]

export const EVENT_SORTS = ['occurred_desc', 'occurred_asc'] as const

/**
 * Server-defined maximum length for the admin search parameter
 * (`Query(max_length=120)` on every admin list endpoint).
 */
export const MAX_SEARCH_LENGTH = 120

/** Reads `q` from the URL, bounded to the server limit before it can reach the API. */
export function readSearchQuery(params: URLSearchParams, key = 'q'): string {
  return readText(params, key).slice(0, MAX_SEARCH_LENGTH)
}

export function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = params.get(key)
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

export function readText(params: URLSearchParams, key: string): string {
  return params.get(key) ?? ''
}

export function readPositiveInt(params: URLSearchParams, key: string, fallback: number): number {
  const raw = Number(params.get(key))
  return Number.isSafeInteger(raw) && raw > 0 ? raw : fallback
}

export function readPageSize(params: URLSearchParams, fallback = 10): number {
  const value = readPositiveInt(params, 'page_size', fallback)
  return [10, 20, 50].includes(value) ? value : fallback
}

/** Applies the given values to the current search params, dropping empty ones. */
export function withParams(
  current: URLSearchParams,
  next: Record<string, string | number | undefined | null>,
): URLSearchParams {
  const params = new URLSearchParams(current)
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null || value === '') params.delete(key)
    else params.set(key, String(value))
  }
  return params
}

/** Formatting locale of the active UI language. */
export function activeLocale(): 'en-GB' | 'ru-RU' {
  return i18n.resolvedLanguage === 'en' ? 'en-GB' : 'ru-RU'
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale()).format(value)
}

/**
 * Compact number used by chart axes, localized with the active language
 * (`1,2 тыс.` in Russian, `1.2K` in English).
 */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/**
 * Rouble amount. Nonzero kopecks are preserved, whole roubles stay without
 * decimals so the tables keep their existing compact presentation.
 */
export function formatMoney(value: string | number): string {
  const amount = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(amount)) return '—'
  const hasFraction = Math.round(Math.abs(amount) * 100) % 100 !== 0
  return `${new Intl.NumberFormat(activeLocale(), {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount)} ₽`
}

export function formatRating(value: number): string {
  return new Intl.NumberFormat(activeLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

/** Decimal without trailing zeros, used by chart axis ticks. */
export function formatDecimal(value: number): string {
  return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 1 }).format(value)
}

export function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function monthsAgoStart(months: number): string {
  const now = new Date()
  return isoDate(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))
}

/**
 * Inclusive start date of a "last N days" period: with `days = 30` the range
 * `daysAgoWindow(30)..today` contains exactly 30 calendar days, today included.
 */
export function daysAgo(days: number): string {
  const now = new Date()
  return isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)))
}

export function niceAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const rawStep = value / 4
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 4 ? 4 : normalized <= 5 ? 5 : normalized <= 6 ? 6 : 10
  return factor * magnitude * 4
}

const RU_MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

/** True when the given ISO dates belong to more than one calendar year. */
export function spansMultipleYears(values: readonly string[]): boolean {
  const years = new Set(values.filter(Boolean).map((value) => value.slice(0, 4)))
  return years.size > 1
}

/**
 * Short month label for chart axes. Multi-year ranges add the year so that
 * "Янв" from 2025 and 2026 stay distinguishable.
 */
export function monthLabel(value: string, options: { withYear?: boolean } = {}): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const month = i18n.resolvedLanguage === 'en'
    ? new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date)
    : RU_MONTHS[date.getMonth()] ?? value
  return options.withYear ? `${month} ${date.getFullYear()}` : month
}

/**
 * Short day label for chart axes: `12 нояб.` in Russian, `12 Nov` in English.
 * The year is added when the compared labels span more than one year.
 */
export function dayLabel(value: string, options: { withYear?: boolean } = {}): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(activeLocale(), {
    day: 'numeric',
    month: 'short',
    ...(options.withYear ? { year: 'numeric' as const } : {}),
  }).format(date)
}

/** Time-axis resolution reported by the analytics API. */
export type ChartGranularity = 'day' | 'month'

/** Axis label of one timeline point in the resolution the API returned. */
export function bucketLabel(
  value: string,
  granularity: ChartGranularity,
  options: { withYear?: boolean } = {},
): string {
  return granularity === 'day' ? dayLabel(value, options) : monthLabel(value, options)
}

export function periodRangeLabel(from: string | null | undefined, to: string | null | undefined): string {
  if (!from && !to) return i18n.t('admin.analytics.all_time')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const start = from ? formatter.format(new Date(`${from.slice(0, 10)}T00:00:00`)) : '—'
  const end = to ? formatter.format(new Date(`${to.slice(0, 10)}T00:00:00`)) : '—'
  return `${start} — ${end}`
}

/** Turns API failures into localized, non-leaking messages. */
export function adminErrorText(error: unknown, fallbackKey = 'admin.errors.default'): string {
  if (!(error instanceof ApiError)) return i18n.t(fallbackKey)
  if (error.status === 0) return i18n.t('admin.errors.network')
  if (error.status === 401) return i18n.t('admin.errors.unauthorized')
  if (error.status === 403) return i18n.t('admin.errors.forbidden')
  if (error.status === 404) return i18n.t('admin.errors.not_found')
  if (error.status === 409) return i18n.t('admin.errors.conflict')
  if (error.status === 422) {
    return error.detail
      ? i18n.t('admin.errors.validation_detail', { detail: error.detail })
      : i18n.t('admin.errors.validation')
  }
  if (error.status >= 500) return i18n.t('admin.errors.server')
  return error.detail ? i18n.t('admin.errors.request_detail', { detail: error.detail }) : i18n.t(fallbackKey)
}
