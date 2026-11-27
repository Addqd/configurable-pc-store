import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import {
  CURRENCY_RATES_QUERY_KEY,
  parseCurrencyRates,
  useCurrencyRates,
} from './currencyRates'
import { render } from '../test-utils'
import type { Currency } from '../utils/currency'

const validPayload = {
  base_currency: 'RUB',
  rates: { RUB: '1', USD: '90.1234', EUR: '100.5678' },
  rate_date: '2026-11-26',
  fetched_at: '2026-11-26T10:00:00Z',
  stale: false,
  source: 'CBR',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('exchange-rate response contract', () => {
  it('accepts the documented payload', () => {
    expect(parseCurrencyRates(validPayload)).toEqual(validPayload)
  })

  it.each([
    ['wrong base currency', { ...validPayload, base_currency: 'USD' }],
    ['wrong source', { ...validPayload, source: 'ECB' }],
    ['missing currency', { ...validPayload, rates: { RUB: '1', USD: '90.1234' } }],
    [
      'unsupported currency',
      { ...validPayload, rates: { ...validPayload.rates, GBP: '100' } },
    ],
    ['RUB rate not 1', { ...validPayload, rates: { ...validPayload.rates, RUB: '1.0' } }],
    ['zero rate', { ...validPayload, rates: { ...validPayload.rates, USD: '0' } }],
    ['negative rate', { ...validPayload, rates: { ...validPayload.rates, EUR: '-1' } }],
    [
      'non-decimal rate',
      { ...validPayload, rates: { ...validPayload.rates, USD: 'ninety' } },
    ],
    ['exponent rate', { ...validPayload, rates: { ...validPayload.rates, USD: '9E1' } }],
    ['invalid date', { ...validPayload, rate_date: '26.11.2026' }],
    ['invalid timestamp', { ...validPayload, fetched_at: 'yesterday' }],
    ['non-boolean stale', { ...validPayload, stale: 'no' }],
    ['missing stale', { base_currency: 'RUB', source: 'CBR', rate_date: '2026-11-26', fetched_at: '2026-11-26T10:00:00Z', rates: { RUB: '1', USD: '1', EUR: '1' } }],
    ['not an object', null],
  ])('rejects %s', (_label, payload) => {
    expect(() => parseCurrencyRates(payload)).toThrow()
  })
})

function RateProbe({ currency }: { currency: Currency }) {
  const query = useCurrencyRates(currency)
  return (
    <span data-testid="probe">
      {query.data ? `${query.data.rates.USD}|${query.data.stale}` : 'none'}
    </span>
  )
}

function stubRatesFetch(payload: unknown = validPayload) {
  const mock = vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('shared exchange-rate query', () => {
  it('does not request rates while RUB is displayed', async () => {
    const fetchMock = stubRatesFetch()
    render(
      <>
        <RateProbe currency="RUB" />
        <RateProbe currency="RUB" />
      </>,
    )
    await waitFor(() => expect(screen.getAllByTestId('probe')).toHaveLength(2))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('issues a single request for many consumers of the same key', async () => {
    const fetchMock = stubRatesFetch()
    render(
      <>
        {Array.from({ length: 8 }, (_, index) => (
          <RateProbe key={index} currency="USD" />
        ))}
      </>,
    )
    await waitFor(() =>
      expect(screen.getAllByTestId('probe')[0].textContent).toBe('90.1234|false'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/v1/currency/rates')
  })

  it('uses the generated query key so every consumer shares one cache entry', () => {
    expect(CURRENCY_RATES_QUERY_KEY).toEqual(['/api/v1/currency/rates'])
  })
})
