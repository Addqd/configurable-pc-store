import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import {
  daysAgo, formatCompactNumber, formatMoney, formatNumber, isoDate, MAX_SEARCH_LENGTH, monthLabel,
  readSearchQuery, spansMultipleYears,
} from './params'

const setLanguage = async (language: 'ru' | 'en') => {
  await i18n.changeLanguage(language)
}

/** `Intl` uses non-breaking spaces for grouping; compare on a readable form. */
const norm = (value: string) => value.replace(/\u00a0|\u202f/g, ' ')

afterEach(async () => {
  vi.useRealTimers()
  await setLanguage('ru')
})

describe('admin money and number formatting', () => {
  it('keeps whole roubles without decimals and preserves nonzero kopecks', async () => {
    expect(norm(formatMoney('22871420.00'))).toBe('22 871 420 ₽')
    expect(norm(formatMoney('64990.5'))).toBe('64 990,50 ₽')
    expect(norm(formatMoney('0.01'))).toBe('0,01 ₽')
    expect(formatMoney('not-a-number')).toBe('—')
  })

  it('switches separators with the active language', async () => {
    await setLanguage('en')
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(norm(formatMoney('64990.5'))).toBe('64,990.50 ₽')
    expect(formatCompactNumber(23000)).toMatch(/^23\s?k$/i)
    expect(norm(formatMoney('1200'))).toBe('1,200 ₽')
  })

  it('formats compact numbers in Russian without leaking the English notation', async () => {
    expect(norm(formatCompactNumber(1200))).toBe('1,2 тыс.')
  })
})

describe('admin chart month labels', () => {
  it('keeps compact month-only labels inside one year', () => {
    expect(monthLabel('2026-06-01')).toBe('Июн')
    expect(spansMultipleYears(['2026-06-01', '2026-11-01'])).toBe(false)
    expect(monthLabel('2026-06-01', { withYear: false })).toBe('Июн')
  })

  it('adds the year when a range spans several years', () => {
    expect(spansMultipleYears(['2025-12-01', '2026-01-01'])).toBe(true)
    expect(monthLabel('2025-12-01', { withYear: true })).toBe('Дек 2025')
    expect(monthLabel('2026-01-01', { withYear: true })).not.toBe(monthLabel('2025-01-01', { withYear: true }))
  })

  it('localizes multi-year labels', async () => {
    await setLanguage('en')
    expect(monthLabel('2025-12-01', { withYear: true })).toBe('Dec 2025')
    expect(monthLabel('2026-01-01')).toBe('Jan')
  })
})

describe('admin period helpers', () => {
  it('computes "last 30 days" as exactly 30 calendar days including today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 15, 30))
    const from = daysAgo(30)
    const to = isoDate(new Date())
    const days = (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000
    expect(from).toBe('2026-10-22')
    expect(days + 1).toBe(30)
  })
})

describe('admin search length', () => {
  it('bounds the URL query to the server limit', () => {
    const params = new URLSearchParams({ q: 'x'.repeat(MAX_SEARCH_LENGTH + 20) })
    expect(readSearchQuery(params)).toHaveLength(MAX_SEARCH_LENGTH)
    expect(readSearchQuery(new URLSearchParams({ q: 'gpu' }))).toBe('gpu')
    expect(readSearchQuery(new URLSearchParams())).toBe('')
  })
})
