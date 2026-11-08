// A pending purchase key survives a reload, so an uncertain network response
// can be retried safely. Only non-secret identifiers are kept here.
const pending = new Map<string, string>()

function storageKey(accountId: string, productId: number, quantity: number) {
  return `pc-buy-now:${accountId}:${productId}:${quantity}`
}

export function buyNowKey(accountId: string, productId: number, quantity: number): string {
  const key = storageKey(accountId, productId, quantity)
  let value = pending.get(key)
  try { value ??= sessionStorage.getItem(key) ?? undefined } catch { /* storage is optional */ }
  value ??= crypto.randomUUID()
  pending.set(key, value)
  try { sessionStorage.setItem(key, value) } catch { /* retain it in memory */ }
  return value
}

export function clearBuyNowKey(accountId: string, productId: number, quantity: number) {
  const key = storageKey(accountId, productId, quantity)
  pending.delete(key)
  try { sessionStorage.removeItem(key) } catch { /* storage is optional */ }
}
