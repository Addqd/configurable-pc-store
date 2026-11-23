/**
 * Structured product characteristic, mirroring one entry of the API
 * `CharacteristicValueOut`. `value` keeps its native JSON type; `displayValue`
 * is the server-rendered, ready-to-show string.
 */
export interface ProductCharacteristic {
  code: string
  name: string
  dataType: string
  unit?: string | null
  value: unknown
  displayValue: string
  showInShort: boolean
  showInDetails: boolean
}

export interface Product {
  id: number
  name: string
  category: string
  type: string
  color?: string
  rating: number
  reviewCount: number
  addedAt: string
  onSale?: boolean
  manufacturer: string
  /** Display lines for compact summaries (already formatted by the server). */
  specs: string[]
  shortSpecs?: string[]
  /**
   * Structured characteristic values by `code`.
   *
   * Builder and compatibility UI read technical values from here instead of
   * parsing display strings, so no fact is inferred from marketing text.
   */
  characteristics?: ProductCharacteristic[]
  graphicsChipBrand?: 'AMD' | 'NVIDIA'
  price: number
  image: string
  slug: string
}

/** Look up one structured characteristic by its stable code. */
export function characteristicOf(
  product: Product | null | undefined,
  code: string,
): ProductCharacteristic | undefined {
  return product?.characteristics?.find((item) => item.code === code)
}

/** Ready-to-render value of one characteristic, or null when it is absent. */
export function characteristicText(
  product: Product | null | undefined,
  code: string,
): string | null {
  const value = characteristicOf(product, code)?.displayValue
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Strict numeric value of one characteristic; booleans and strings never count. */
export function characteristicNumber(
  product: Product | null | undefined,
  code: string,
): number | null {
  const value = characteristicOf(product, code)?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Ordered string list value of one characteristic. */
export function characteristicTextList(
  product: Product | null | undefined,
  code: string,
): string[] | null {
  const value = characteristicOf(product, code)?.value
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}
