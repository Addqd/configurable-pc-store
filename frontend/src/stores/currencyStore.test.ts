import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CURRENCY_STORAGE_KEY, useCurrencyStore } from './currencyStore'

function seedStorage(value: string) {
  localStorage.setItem(CURRENCY_STORAGE_KEY, value)
}

async function rehydrate() {
  await useCurrencyStore.persist.rehydrate()
  return useCurrencyStore.getState().currency
}

beforeEach(() => {
  localStorage.clear()
  useCurrencyStore.setState({ currency: 'RUB' })
})

afterEach(() => {
  localStorage.clear()
  useCurrencyStore.setState({ currency: 'RUB' })
})

describe('currency preference store', () => {
  it('defaults to RUB', () => {
    expect(useCurrencyStore.getState().currency).toBe('RUB')
  })

  it('accepts the three supported currencies', () => {
    for (const code of ['USD', 'EUR', 'RUB'] as const) {
      useCurrencyStore.getState().setCurrency(code)
      expect(useCurrencyStore.getState().currency).toBe(code)
    }
  })

  it('falls back to RUB when the setter receives an unsupported value', () => {
    useCurrencyStore.getState().setCurrency('USD')
    // Runtime callers can still pass arbitrary strings.
    useCurrencyStore.getState().setCurrency('GBP' as never)
    expect(useCurrencyStore.getState().currency).toBe('RUB')
  })

  it('persists only the currency preference and never rates', () => {
    useCurrencyStore.getState().setCurrency('EUR')
    const raw = JSON.parse(localStorage.getItem(CURRENCY_STORAGE_KEY) ?? '{}')
    expect(raw.state).toEqual({ currency: 'EUR' })
    expect(Object.keys(raw.state)).toEqual(['currency'])
    expect(JSON.stringify(raw)).not.toContain('rates')
  })

  it('restores a valid persisted preference', async () => {
    seedStorage(JSON.stringify({ state: { currency: 'USD' }, version: 0 }))
    expect(await rehydrate()).toBe('USD')
  })

  it.each([
    ['unsupported code', { currency: 'GBP' }],
    ['numeric value', { currency: 42 }],
    ['null value', { currency: null }],
    ['empty object', {}],
  ])('recovers from a %s by falling back to RUB', async (_label, state) => {
    seedStorage(JSON.stringify({ state, version: 0 }))
    expect(await rehydrate()).toBe('RUB')
  })

  it('recovers from malformed JSON storage', async () => {
    seedStorage('{not json')
    expect(await rehydrate()).toBe('RUB')
  })

  it('keeps the preference independent from language and theme keys', () => {
    localStorage.setItem('pc-builder-lang', 'en')
    localStorage.setItem('pc-builder-theme', JSON.stringify({ state: { isDark: true }, version: 0 }))
    useCurrencyStore.getState().setCurrency('USD')
    expect(useCurrencyStore.getState().currency).toBe('USD')
    expect(localStorage.getItem('pc-builder-lang')).toBe('en')
    expect(JSON.parse(localStorage.getItem('pc-builder-theme') ?? '{}').state.isDark).toBe(true)
  })
})
