import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isCurrency, type Currency } from '../utils/currency'

/**
 * Currency preference only: exchange rates are never persisted, so a stale
 * snapshot stored in a browser can never outlive the backend's own cache.
 */
export const CURRENCY_STORAGE_KEY = 'pc-builder-currency'

interface CurrencyState {
  currency: Currency
  setCurrency: (currency: Currency) => void
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: 'RUB',
      setCurrency: (currency) =>
        set({ currency: isCurrency(currency) ? currency : 'RUB' }),
    }),
    {
      name: CURRENCY_STORAGE_KEY,
      partialize: (state) => ({ currency: state.currency }),
      // A corrupted or outdated preference falls back to RUB instead of breaking
      // the storefront: every restored value is validated before it is accepted.
      merge: (persisted, current) => {
        const restored = (persisted as { currency?: unknown } | undefined)
          ?.currency
        return {
          ...current,
          currency: isCurrency(restored) ? restored : 'RUB',
        }
      },
    },
  ),
)
