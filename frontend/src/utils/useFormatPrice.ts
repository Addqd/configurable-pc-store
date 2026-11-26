import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrencyRates } from '../api/currencyRates'
import { useCurrencyStore } from '../stores/currencyStore'
import { formatMoney, type Currency } from './currency'

/** Interface locale used for money formatting, mirroring `formatPrice`. */
export function moneyLocale(language: string | undefined): string {
  return language?.startsWith('en') ? 'en-GB' : 'ru-RU'
}

export interface CurrencyDisplay {
  /** Formats one authoritative RUB amount in the selected currency. */
  format: (amountRub: number) => string
  currency: Currency
  /** False while a foreign currency is selected but no valid rate is cached. */
  rateAvailable: boolean
  /** True while the first rate for the selected currency is still being fetched. */
  rateLoading: boolean
  /** True when the backend served an expired snapshot after a failed refresh. */
  stale: boolean
  /** Effective rate date reported by the provider, ISO `YYYY-MM-DD`. */
  rateDate: string | null
}

/**
 * Single reactive entry point for currency-aware price presentation.
 *
 * Subscribes to the selected currency, the active interface language and the
 * shared rate query, so every consumer re-renders when any of them changes.
 * Formatting itself stays in the pure `formatMoney` helper.
 */
export function useCurrencyDisplay(): CurrencyDisplay {
  const currency = useCurrencyStore((state) => state.currency)
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const rates = useCurrencyRates(currency)
  const rate = currency === 'RUB' ? null : rates.data?.rates[currency] ?? null
  const format = useCallback(
    (amountRub: number) =>
      formatMoney(amountRub, { currency, rate, locale: moneyLocale(language) }),
    [currency, rate, language],
  )
  return {
    format,
    currency,
    rateAvailable: currency === 'RUB' || rate !== null,
    rateLoading: currency !== 'RUB' && rates.isPending,
    stale: rate !== null && rates.data?.stale === true,
    rateDate: rates.data?.rate_date ?? null,
  }
}

/** Shorthand for price components that only need the formatter. */
export function useFormatPrice(): (amountRub: number) => string {
  return useCurrencyDisplay().format
}
