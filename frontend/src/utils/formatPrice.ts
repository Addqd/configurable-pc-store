/**
 * Canonical rouble formatting.
 *
 * Rouble amounts are the authoritative monetary value of the store: they are
 * stored, sent and calculated in RUB and only formatted here. The presentation
 * is fixed for the currency itself, so the interface language never changes the
 * separators, the symbol placement or the number of decimal places.
 *
 * `Intl` already emits a non-breaking space (U+00A0) both for digit grouping and
 * between the amount and the ruble sign in `ru-RU`.
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}
