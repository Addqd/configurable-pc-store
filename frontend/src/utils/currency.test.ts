import { describe, expect, it } from 'vitest'
import { formatPrice } from './formatPrice'
import {
  CURRENCY_SYMBOLS,
  SUPPORTED_CURRENCIES,
  convertRubToMinorUnits,
  formatMoney,
  isCurrency,
  parseRate,
} from './currency'

const intl = (locale: string, currency: 'USD' | 'EUR', amount: number) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

describe('supported currencies', () => {
  it('offers exactly RUB, USD and EUR in that order', () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual(['RUB', 'USD', 'EUR'])
  })

  it('uses plain symbols only', () => {
    expect(CURRENCY_SYMBOLS).toEqual({ RUB: '₽', USD: '$', EUR: '€' })
  })

  it('validates currency codes', () => {
    expect(isCurrency('RUB')).toBe(true)
    expect(isCurrency('emptyay')).toBe(false)
    expect(isCurrency('GBP')).toBe(false)
    expect(isCurrency(42)).toBe(false)
    expect(isCurrency(null)).toBe(false)
  })
})

describe('parseRate', () => {
  it('parses decimal strings into exact integer terms', () => {
    expect(parseRate('90.1234')).toEqual({ mantissa: 901234n, scale: 4 })
    expect(parseRate('1')).toEqual({ mantissa: 1n, scale: 0 })
  })

  it.each([
    '0',
    '0.000',
    '-90.5',
    '',
    '1E5',
    '1,5',
    'abc',
    '90.1234.5',
  ])('rejects %s', (value) => {
    expect(parseRate(value)).toBeNull()
  })

  it('rejects missing values', () => {
    expect(parseRate(null)).toBeNull()
    expect(parseRate(undefined)).toBeNull()
  })
})

describe('RUB conversion', () => {
  it('converts an authoritative RUB amount with the daily rate', () => {
    // 9 000 RUB at 90 RUB/USD is exactly 100.00 USD (10000 cents).
    expect(convertRubToMinorUnits(9000, '90')).toBe(10000)
    // 9 000 RUB at 100 RUB/EUR is exactly 90.00 EUR (9000 cents).
    expect(convertRubToMinorUnits(9000, '100')).toBe(9000)
  })

  it('rounds exactly once, half away from zero', () => {
    expect(convertRubToMinorUnits(1, '8')).toBe(13) // 0.125 -> 0.13
    expect(convertRubToMinorUnits(-1, '8')).toBe(-13)
  })

  it('keeps integer arithmetic deterministic for fractional rates', () => {
    expect(convertRubToMinorUnits(159990, '82.1265')).toBe(194809)
    expect(convertRubToMinorUnits(0, '82.1265')).toBe(0)
  })

  it('never re-converts an already converted amount', () => {
    const usd = convertRubToMinorUnits(9000, '90')
    expect(usd).toBe(10000)
    // Converting the converted display value again would drift from 100.00.
    expect(convertRubToMinorUnits(Number(usd) / 100, '90')).not.toBe(10000)
  })

  it('rejects unusable rates and amounts', () => {
    expect(convertRubToMinorUnits(1000, '0')).toBeNull()
    expect(convertRubToMinorUnits(1000, 'abc')).toBeNull()
    expect(convertRubToMinorUnits(Number.NaN, '90')).toBeNull()
    expect(convertRubToMinorUnits(Number.POSITIVE_INFINITY, '90')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('keeps the canonical RUB formatting when RUB is selected', () => {
    for (const amount of [0, 159990, 244.86]) {
      expect(formatMoney(amount, { currency: 'RUB', rate: null, locale: 'ru-RU' })).toBe(
        formatPrice(amount),
      )
    }
  })

  it('falls back to RUB when no rate is available', () => {
    expect(formatMoney(9000, { currency: 'USD', rate: null, locale: 'ru-RU' })).toBe(
      formatPrice(9000),
    )
    expect(
      formatMoney(9000, { currency: 'USD', rate: 'not-a-rate', locale: 'ru-RU' }),
    ).toBe(formatPrice(9000))
  })

  it('formats USD and EUR with two decimals in the active locale', () => {
    expect(formatMoney(9000, { currency: 'USD', rate: '90', locale: 'ru-RU' })).toBe(
      intl('ru-RU', 'USD', 100),
    )
    expect(formatMoney(9000, { currency: 'USD', rate: '90', locale: 'en-GB' })).toBe(
      intl('en-GB', 'USD', 100),
    )
    expect(formatMoney(9000, { currency: 'EUR', rate: '100', locale: 'ru-RU' })).toBe(
      intl('ru-RU', 'EUR', 90),
    )
    expect(formatMoney(9000, { currency: 'EUR', rate: '100', locale: 'en-GB' })).toBe(
      intl('en-GB', 'EUR', 90),
    )
  })

  it('always shows two decimals for foreign currencies', () => {
    expect(formatMoney(900, { currency: 'USD', rate: '90', locale: 'en-GB' })).toBe(
      intl('en-GB', 'USD', 10),
    )
    expect(formatMoney(900, { currency: 'USD', rate: '90', locale: 'en-GB' })).toContain(
      '10.00',
    )
  })

  it('converts one authoritative total instead of summing rounded parts', () => {
    const parts = [3333.33, 3333.33, 3333.34]
    const total = parts.reduce((sum, part) => sum + part, 0)
    const convertedTotal = convertRubToMinorUnits(total, '82.1265')
    const sumOfConverted = parts
      .map((part) => convertRubToMinorUnits(part, '82.1265') ?? 0)
      .reduce((sum, part) => sum + part, 0)
    expect(convertedTotal).toBe(12176)
    // Summing the rounded parts would drift by one cent.
    expect(sumOfConverted).toBe(12177)
  })
})
