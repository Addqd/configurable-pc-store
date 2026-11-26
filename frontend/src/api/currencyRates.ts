import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  getCurrencyRatesApiV1CurrencyRatesGet,
  getGetCurrencyRatesApiV1CurrencyRatesGetQueryKey,
} from './generated/client'
import type { Currency } from '../utils/currency'
import { parseRate } from '../utils/currency'

const ONE_HOUR = 60 * 60 * 1000

/**
 * Runtime contract for the public rates endpoint.
 *
 * The generated zod schema checks the documented shape; this stricter contract
 * additionally rejects anything the storefront could not safely format: unknown
 * currencies, a wrong base or source, non-decimal or non-positive rates, a RUB
 * rate other than 1, and invalid date/timestamp fields.
 */
const decimalRate = z
  .string()
  .refine((value) => parseRate(value) !== null, {
    message: 'rate must be a positive decimal string',
  })

const currencyRatesContract = z.strictObject({
  base_currency: z.literal('RUB'),
  source: z.literal('CBR'),
  rate_date: z.iso.date(),
  fetched_at: z.iso.datetime({ offset: true }),
  stale: z.boolean(),
  rates: z.strictObject({
    RUB: decimalRate.refine((value) => value === '1', {
      message: 'the base currency rate must be exactly 1',
    }),
    USD: decimalRate,
    EUR: decimalRate,
  }),
})

export type ValidatedCurrencyRates = z.infer<typeof currencyRatesContract>

/** Throws on any deviation from the contract, so bad data never enters the cache. */
export function parseCurrencyRates(payload: unknown): ValidatedCurrencyRates {
  return currencyRatesContract.parse(payload)
}

export const CURRENCY_RATES_QUERY_KEY = getGetCurrencyRatesApiV1CurrencyRatesGetQueryKey()

/**
 * One shared public query for every price label in the application.
 *
 * Enabled only while a foreign currency is displayed: RUB prices need no rate at
 * all, and a single cache entry serves every card, so no price label can create
 * its own upstream request.
 */
export function useCurrencyRates(currency: Currency) {
  const enabled = currency !== 'RUB'
  return useQuery({
    queryKey: CURRENCY_RATES_QUERY_KEY,
    queryFn: async ({ signal }) =>
      parseCurrencyRates(await getCurrencyRatesApiV1CurrencyRatesGet({ signal })),
    enabled,
    staleTime: ONE_HOUR,
    // Keep the last valid snapshot in memory across failed refreshes.
    gcTime: 24 * ONE_HOUR,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 4000),
    refetchInterval: enabled ? ONE_HOUR : false,
    refetchOnReconnect: true,
  })
}
