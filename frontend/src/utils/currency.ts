import { formatPrice } from './formatPrice'

/**
 * Currencies a customer may display prices in. Every stored, sent and calculated
 * monetary value stays in RUB; only the presentation is converted.
 */
export const SUPPORTED_CURRENCIES = ['RUB', 'USD', 'EUR'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

/** Plain text symbols only: the picker never shows flags, images or icons. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
}

export function isCurrency(value: unknown): value is Currency {
  return (
    typeof value === 'string' &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  )
}

/** Non-negative decimal with a point, as published by the rates API. */
const DECIMAL_PATTERN = /^\d{1,18}(?:\.\d{1,12})?$/

export interface ScaledRate {
  /** Integer mantissa: `90.1234` becomes `901234n`. */
  mantissa: bigint
  /** Number of decimal places stripped from the mantissa. */
  scale: number
}

/** Parses a rate into exact integer terms; rejects malformed or non-positive values. */
export function parseRate(rate: string | null | undefined): ScaledRate | null {
  if (typeof rate !== 'string' || !DECIMAL_PATTERN.test(rate)) return null
  const [whole, fraction = ''] = rate.split('.')
  const mantissa = BigInt(whole + fraction)
  if (mantissa <= 0n) return null
  return { mantissa, scale: fraction.length }
}

/** Authoritative RUB amounts arrive as JS numbers; round once to integer kopeks. */
function toKopeks(amountRub: number): bigint | null {
  if (typeof amountRub !== 'number' || !Number.isFinite(amountRub)) return null
  const kopeks = Math.round(amountRub * 100)
  return Number.isSafeInteger(kopeks) ? BigInt(kopeks) : null
}

/**
 * Converts one authoritative RUB amount into the target currency's minor units.
 *
 * `display = rubles / rate`, computed in integers so no binary floating point
 * error can accumulate, and rounded exactly once at this boundary.
 */
export function convertRubToMinorUnits(
  amountRub: number,
  rate: string,
): number | null {
  const kopeks = toKopeks(amountRub)
  const parsed = parseRate(rate)
  if (kopeks === null || parsed === null) return null
  const numerator = kopeks * 10n ** BigInt(parsed.scale)
  const denominator = parsed.mantissa
  const negative = numerator < 0n
  const magnitude = negative ? -numerator : numerator
  // Round half away from zero: (2a + b) / 2b for a/b >= 0.
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n)
  const minor = Number(negative ? -rounded : rounded)
  return Number.isSafeInteger(minor) ? minor : null
}

/**
 * Formats an authoritative RUB amount for display.
 *
 * RUB — and any state where no valid rate is available — keeps the existing
 * storefront formatting, including the ruble symbol.
 */
export function formatMoney(
  amountRub: number,
  options: { currency: Currency; rate: string | null; locale: string },
): string {
  const { currency, rate, locale } = options
  if (currency !== 'RUB' && rate !== null) {
    const minor = convertRubToMinorUnits(amountRub, rate)
    if (minor !== null) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(minor / 100)
    }
  }
  return formatPrice(amountRub)
}
