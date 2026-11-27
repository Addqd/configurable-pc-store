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
  /** The contract requires U+00A0 for grouping and before the currency symbol. */
  const NBSP = '\u00a0'
  /** Rate `1` keeps the amount unchanged, so these cases describe formatting only. */
  const display = (currency: 'USD' | 'EUR', amount: number) =>
    formatMoney(amount, { currency, rate: '1' })

  it('formats rouble amounts with the fixed RUB presentation', () => {
    expect(formatMoney(0, { currency: 'RUB', rate: null })).toBe(`0${NBSP}₽`)
    expect(formatMoney(1, { currency: 'RUB', rate: null })).toBe(`1${NBSP}₽`)
    expect(formatMoney(1000, { currency: 'RUB', rate: null })).toBe(`1${NBSP}000${NBSP}₽`)
    expect(formatMoney(1234.56, { currency: 'RUB', rate: null })).toBe(
      `1${NBSP}235${NBSP}₽`,
    )
    expect(formatMoney(1234567.89, { currency: 'RUB', rate: null })).toBe(
      `1${NBSP}234${NBSP}568${NBSP}₽`,
    )
  })

  it('keeps rouble amounts free of decimals and grouping with plain spaces', () => {
    expect(formatMoney(64990.5, { currency: 'RUB', rate: null })).toBe(
      `64${NBSP}991${NBSP}₽`,
    )
    expect(formatMoney(1000, { currency: 'RUB', rate: null })).not.toContain(' ')
    expect(formatMoney(1000, { currency: 'RUB', rate: null })).not.toContain('RUB')
  })

  it('formats USD with a comma separator, a point decimal and the plain dollar sign', () => {
    expect(display('USD', 0)).toBe('$0.00')
    expect(display('USD', 1)).toBe('$1.00')
    expect(display('USD', 1000)).toBe('$1,000.00')
    expect(display('USD', 1234.56)).toBe('$1,234.56')
    expect(display('USD', 1234567.89)).toBe('$1,234,567.89')
  })

  it('never renders USD as US$ or with a code suffix', () => {
    const formatted = display('USD', 1234.56)
    expect(formatted).not.toContain('US$')
    expect(formatted).not.toContain('USD')
    expect(formatted.startsWith('$')).toBe(true)
    expect(formatted.endsWith('$')).toBe(false)
  })

  it('formats EUR with the symbol after the amount and a comma decimal', () => {
    expect(display('EUR', 0)).toBe(`0,00${NBSP}€`)
    expect(display('EUR', 1)).toBe(`1,00${NBSP}€`)
    expect(display('EUR', 1000)).toBe(`1${NBSP}000,00${NBSP}€`)
    expect(display('EUR', 1234.56)).toBe(`1${NBSP}234,56${NBSP}€`)
    expect(display('EUR', 1234567.89)).toBe(`1${NBSP}234${NBSP}567,89${NBSP}€`)
  })

  it('always shows exactly two decimals for foreign currencies', () => {
    const USD_PATTERN = /^\$\d{1,3}(?:,\d{3})*\.\d{2}$/
    const EUR_PATTERN = new RegExp(`^\\d{1,3}(?:${NBSP}\\d{3})*,\\d{2}${NBSP}€$`)
    for (const amount of [0, 1, 1000, 1234567.89]) {
      expect(display('USD', amount)).toMatch(USD_PATTERN)
      expect(display('EUR', amount)).toMatch(EUR_PATTERN)
    }
  })

  it('rounds the converted amount once at the display boundary', () => {
    // 1 RUB at 8 RUB/USD is 0.125 USD, rounded half away from zero to 0.13.
    expect(formatMoney(1, { currency: 'USD', rate: '8' })).toBe('$0.13')
    // Rouble amounts keep the existing single rounding to whole roubles.
    expect(formatMoney(0.5, { currency: 'RUB', rate: null })).toBe(`1${NBSP}₽`)
    expect(formatMoney(0.49, { currency: 'RUB', rate: null })).toBe(`0${NBSP}₽`)
  })

  it('falls back to the fixed RUB formatting when no rate is available', () => {
    expect(formatMoney(9000, { currency: 'USD', rate: null })).toBe(formatPrice(9000))
    expect(formatMoney(9000, { currency: 'USD', rate: 'not-a-rate' })).toBe(
      formatPrice(9000),
    )
    expect(formatMoney(9000, { currency: 'EUR', rate: '0' })).toBe(formatPrice(9000))
  })

  it('never re-converts an already converted amount', () => {
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
