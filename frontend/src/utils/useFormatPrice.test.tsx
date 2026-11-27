import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { createTestQueryClient, render } from '../test-utils'
import { useCurrencyDisplay, moneyLocale } from './useFormatPrice'
import { formatPrice } from './formatPrice'
import { CURRENCY_RATES_QUERY_KEY } from '../api/currencyRates'
import { isPrivateQueryKey } from '../api/queryClient'
import { isPrivateEndpoint } from '../api/privateEndpoints'
import { useCurrencyStore } from '../stores/currencyStore'
import i18n from '../i18n'

const validPayload = {
  base_currency: 'RUB',
  rates: { RUB: '1', USD: '90', EUR: '100' },
  rate_date: '2026-11-26',
  fetched_at: '2026-11-26T10:00:00Z',
  stale: false,
  source: 'CBR',
}

/** Exact display strings: USD is converted at 90 RUB/USD, EUR at 100 RUB/EUR. */
const USD_100 = '$100.00'
const EUR_90 = `90,00\u00a0€`
const RUB_9000 = `9\u00a0000\u00a0₽`

function stubRates(payload: unknown = validPayload) {
  const mock = vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

function PriceProbe({ amountRub }: { amountRub: number }) {
  const display = useCurrencyDisplay()
  return (
    <div>
      <span data-testid="price">{display.format(amountRub)}</span>
      <span data-testid="rate">{display.rateAvailable ? 'available' : 'unavailable'}</span>
      <span data-testid="stale">{display.stale ? 'stale' : 'fresh'}</span>
      <span data-testid="amount">{String(amountRub)}</span>
    </div>
  )
}

const price = () => screen.getByTestId('price').textContent

beforeEach(async () => {
  localStorage.clear()
  useCurrencyStore.setState({ currency: 'RUB' })
  await i18n.changeLanguage('ru')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  useCurrencyStore.setState({ currency: 'RUB' })
})

describe('reactive price formatting', () => {
  it('formats RUB immediately without requesting rates', () => {
    const fetchMock = stubRates()
    render(<PriceProbe amountRub={9000} />)
    expect(price()).toBe(RUB_9000)
    expect(price()).toBe(formatPrice(9000))
    expect(screen.getByTestId('rate').textContent).toBe('available')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-renders with the converted price when the currency changes', async () => {
    stubRates()
    render(<PriceProbe amountRub={9000} />)
    expect(price()).toBe(RUB_9000)
    act(() => useCurrencyStore.getState().setCurrency('USD'))
    await waitFor(() => expect(price()).toBe(USD_100))
    // The authoritative RUB amount is never replaced by the display value.
    expect(screen.getByTestId('amount').textContent).toBe('9000')
  })

  it('switches between currencies and back without extra requests', async () => {
    const fetchMock = stubRates()
    render(<PriceProbe amountRub={9000} />)
    act(() => useCurrencyStore.getState().setCurrency('USD'))
    await waitFor(() => expect(price()).toBe(USD_100))
    act(() => useCurrencyStore.getState().setCurrency('EUR'))
    await waitFor(() => expect(price()).toBe(EUR_90))
    act(() => useCurrencyStore.getState().setCurrency('RUB'))
    await waitFor(() => expect(price()).toBe(RUB_9000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the same price in both interface languages', async () => {
    stubRates()
    const { rerender } = render(<PriceProbe amountRub={9000} />)
    act(() => useCurrencyStore.getState().setCurrency('USD'))
    await waitFor(() => expect(price()).toBe(USD_100))
    const russian = price()
    const russianRub = formatPrice(9000)

    await act(async () => {
      await i18n.changeLanguage('en')
    })
    rerender(<PriceProbe amountRub={9000} />)
    // Money presentation follows the currency, never the interface language.
    expect(price()).toBe(russian)
    expect(price()).toBe(USD_100)
    expect(russianRub).toBe(RUB_9000)
    expect(formatPrice(9000)).toBe(russianRub)

    act(() => useCurrencyStore.getState().setCurrency('EUR'))
    await waitFor(() => expect(price()).toBe(EUR_90))
    act(() => useCurrencyStore.getState().setCurrency('RUB'))
    await waitFor(() => expect(price()).toBe(RUB_9000))
  })

  it('falls back to RUB prices when the rate is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"detail":"unavailable"}', {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )
    useCurrencyStore.setState({ currency: 'USD' })
    render(<PriceProbe amountRub={9000} />)
    await waitFor(() => expect(screen.getByTestId('rate').textContent).toBe('unavailable'))
    expect(price()).toBe(RUB_9000)
    // The preference itself is preserved for an automatic recovery.
    expect(useCurrencyStore.getState().currency).toBe('USD')
  })

  it('recovers foreign-currency display after a successful retrieval', async () => {
    const failing = vi.fn(
      async () =>
        new Response('{"detail":"unavailable"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', failing)
    const client = createTestQueryClient()
    useCurrencyStore.setState({ currency: 'USD' })
    render(<PriceProbe amountRub={9000} />, { client })
    await waitFor(() => expect(screen.getByTestId('rate').textContent).toBe('unavailable'))
    expect(price()).toBe(RUB_9000)

    stubRates()
    await act(async () => {
      await client.refetchQueries({ queryKey: CURRENCY_RATES_QUERY_KEY })
    })
    await waitFor(() => expect(price()).toBe(USD_100))
    expect(screen.getByTestId('rate').textContent).toBe('available')
  })

  it('reports a stale snapshot without changing the conversion', async () => {
    stubRates({ ...validPayload, stale: true })
    useCurrencyStore.setState({ currency: 'USD' })
    render(<PriceProbe amountRub={9000} />)
    await waitFor(() => expect(screen.getByTestId('stale').textContent).toBe('stale'))
    expect(price()).toBe(USD_100)
  })

  it('keeps the last valid snapshot when a refresh returns malformed data', async () => {
    const client = createTestQueryClient()
    stubRates()
    useCurrencyStore.setState({ currency: 'USD' })
    render(<PriceProbe amountRub={9000} />, { client })
    await waitFor(() => expect(price()).toBe(USD_100))

    // A malformed refresh must be rejected by the runtime contract.
    stubRates({ ...validPayload, rates: { RUB: '1', USD: '-5', EUR: '100' } })
    await act(async () => {
      await client.refetchQueries({ queryKey: CURRENCY_RATES_QUERY_KEY })
    })
    expect(price()).toBe(USD_100)
    expect(client.getQueryState(CURRENCY_RATES_QUERY_KEY)?.status).toBe('error')
  })

  it('keeps foreign prices unavailable when the response is malformed from the start', async () => {
    stubRates({ ...validPayload, rates: { RUB: '1', USD: 'nope', EUR: '100' } })
    useCurrencyStore.setState({ currency: 'USD' })
    render(<PriceProbe amountRub={9000} />)
    await waitFor(() => expect(screen.getByTestId('rate').textContent).toBe('unavailable'))
    expect(price()).toBe(RUB_9000)
  })

  it('is unaffected by session cleanup: the rate query is public', () => {
    expect(isPrivateEndpoint('/api/v1/currency/rates')).toBe(false)
    expect(isPrivateQueryKey(CURRENCY_RATES_QUERY_KEY)).toBe(false)
  })

  it('keeps the date locale helper localized by interface language', () => {
    // Used for the exchange-rate date only; money no longer reads it.
    expect(moneyLocale('en')).toBe('en-GB')
    expect(moneyLocale('en-US')).toBe('en-GB')
    expect(moneyLocale('ru')).toBe('ru-RU')
    expect(moneyLocale(undefined)).toBe('ru-RU')
  })
})
