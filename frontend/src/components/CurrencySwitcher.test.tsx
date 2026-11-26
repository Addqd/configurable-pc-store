import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { CurrencySwitcher } from './CurrencySwitcher'
import { render } from '../test-utils'
import { CURRENCY_STORAGE_KEY, useCurrencyStore } from '../stores/currencyStore'
import i18n from '../i18n'

const validPayload = {
  base_currency: 'RUB',
  rates: { RUB: '1', USD: '90.1234', EUR: '100.5678' },
  rate_date: '2026-11-26',
  fetched_at: '2026-11-26T10:00:00Z',
  stale: false,
  source: 'CBR',
}

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

function stubFailingRates() {
  const mock = vi.fn(async () => new Response('{"detail":"unavailable"}', { status: 503, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', mock)
  return mock
}

const trigger = () => screen.getByRole('button', { name: /Валюта|Currency/ })

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

describe('CurrencySwitcher', () => {
  it('shows the selected currency in a closed neutral trigger', () => {
    render(<CurrencySwitcher />)
    expect(trigger().textContent).toContain('RUB')
    expect(trigger().textContent).toContain('₽')
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens exactly three options in the documented order with RUB selected', () => {
    render(<CurrencySwitcher />)
    fireEvent.click(trigger())
    const options = screen.getAllByRole('menuitemradio')
    expect(options).toHaveLength(3)
    expect(options.map((option) => option.textContent)).toEqual(['₽RUB', '$USD', '€EUR'])
    expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('selects a currency, persists it and closes the menu', async () => {
    render(<CurrencySwitcher />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getAllByRole('menuitemradio')[1])
    expect(useCurrencyStore.getState().currency).toBe('USD')
    expect(JSON.parse(localStorage.getItem(CURRENCY_STORAGE_KEY) ?? '{}').state).toEqual({
      currency: 'USD',
    })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().textContent).toContain('USD')
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'))
  })

  it('moves focus with the arrow keys and closes with Escape', () => {
    render(<CurrencySwitcher />)
    fireEvent.click(trigger())
    const options = screen.getAllByRole('menuitemradio')
    expect(document.activeElement).toBe(options[0])
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options[1])
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(options[0])
    fireEvent.keyDown(document, { key: 'End' })
    expect(document.activeElement).toBe(options[2])
    fireEvent.keyDown(document, { key: 'Home' })
    expect(document.activeElement).toBe(options[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('opens with the keyboard from the trigger', () => {
    render(<CurrencySwitcher />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
  })

  it('dismisses on an outside click without changing the selection', () => {
    render(<CurrencySwitcher />)
    fireEvent.click(trigger())
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(useCurrencyStore.getState().currency).toBe('RUB')
  })

  it('keeps the menu open when the click happens inside it', () => {
    render(<CurrencySwitcher />)
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('marks the menu with the localized accessible label', () => {
    render(<CurrencySwitcher />)
    fireEvent.click(trigger())
    const menu = screen.getByRole('menu')
    expect(menu.getAttribute('aria-label')).toBe('Валюта')
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(3)
  })

  it('exposes the effective rate date when the selected currency has a rate', async () => {
    useCurrencyStore.setState({ currency: 'USD' })
    stubRates()
    render(<CurrencySwitcher />)
    await waitFor(() => expect(trigger().getAttribute('title')).toMatch(/Курс ЦБ РФ на/))
    expect(trigger().getAttribute('title')).not.toMatch(/устареть/)
    const describedBy = trigger().getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(String(describedBy))?.textContent).toMatch(
      /Курс ЦБ РФ на/,
    )
  })

  it('reports a stale snapshot', async () => {
    useCurrencyStore.setState({ currency: 'USD' })
    stubRates({ ...validPayload, stale: true })
    render(<CurrencySwitcher />)
    await waitFor(() => expect(trigger().getAttribute('title')).toMatch(/устареть/))
  })

  it('does not flag an outage while the first rate request is in flight', async () => {
    let resolveFetch!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    useCurrencyStore.setState({ currency: 'USD' })
    render(<CurrencySwitcher />)
    // RUB prices are shown meanwhile, but the state is "loading", not "unavailable".
    expect(trigger().getAttribute('title')).toBeNull()
    expect(trigger().getAttribute('aria-describedby')).toBeNull()
    resolveFetch(
      new Response(JSON.stringify(validPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await waitFor(() => expect(trigger().getAttribute('title')).toMatch(/Курс ЦБ РФ на/))
  })

  it('flags unavailable rates while keeping the selected preference', async () => {
    useCurrencyStore.setState({ currency: 'EUR' })
    stubFailingRates()
    render(<CurrencySwitcher />)
    // The query retries the request twice before the outage becomes visible.
    await waitFor(
      () => expect(trigger().getAttribute('title')).toMatch(/Курс валют недоступен/),
      { timeout: 5000 },
    )
    expect(useCurrencyStore.getState().currency).toBe('EUR')
    expect(trigger().textContent).toContain('EUR')
    // The discreet indicator is a separate element, not a dropdown row.
    const describedBy = trigger().getAttribute('aria-describedby')
    expect(document.getElementById(String(describedBy))?.textContent).toBe(
      'Курс валют недоступен. Цены показаны в рублях.',
    )
    fireEvent.click(trigger())
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
  })

  it('stays neutral in the English locale', async () => {
    await i18n.changeLanguage('en')
    render(<CurrencySwitcher />)
    expect(screen.getByRole('button', { name: /Currency/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Currency/ }))
    expect(screen.getAllByRole('menuitemradio').map((option) => option.textContent)).toEqual([
      '₽RUB',
      '$USD',
      '€EUR',
    ])
    expect(screen.getByRole('menu').getAttribute('aria-label')).toBe('Currency')
  })
})
