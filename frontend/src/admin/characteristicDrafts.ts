/**
 * Editor drafts for category-scoped product characteristics.
 *
 * The admin form keeps one draft per characteristic `code` so that every data
 * type gets a suitable control: text, numeric, boolean, string list or number
 * list. Drafts are converted to the API payload only at submit time, so list
 * order and duplicates are preserved exactly (no comma splitting anywhere).
 */

export type CharacteristicFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'string_list'
  | 'number_list'

/** The subset of the generated definition schema the editor needs. */
export interface CharacteristicDefinitionLike {
  code: string
  name: string
  data_type: string
  unit?: string | null
  sort_order: number
  is_required: boolean
  show_in_short: boolean
  show_in_details: boolean
}

export interface CharacteristicDraft {
  kind: CharacteristicFieldType
  /** Text of a `string`/`number` value, or the raw text of one list row. */
  text: string
  /** Current state of a `boolean` value. */
  checked: boolean
  /** Rows of a `string_list` / `number_list` value, in entered order. */
  items: string[]
}

export type DraftIssue = 'required' | 'number' | 'too_long'

export type DraftResult =
  | { ok: true; value: unknown }
  | { ok: false; issue: DraftIssue }

export const MAX_TEXT_LENGTH = 500
export const MAX_LIST_ROWS = 50

const DATA_TYPES: readonly CharacteristicFieldType[] = [
  'string',
  'number',
  'boolean',
  'string_list',
  'number_list',
]

export function fieldTypeOf(dataType: string): CharacteristicFieldType {
  return DATA_TYPES.includes(dataType as CharacteristicFieldType)
    ? (dataType as CharacteristicFieldType)
    : 'string'
}

export function emptyDraft(dataType: string): CharacteristicDraft {
  return { kind: fieldTypeOf(dataType), text: '', checked: false, items: [] }
}

/** Draft for a stored value coming back from the API. */
export function draftFromValue(dataType: string, value: unknown): CharacteristicDraft {
  const kind = fieldTypeOf(dataType)
  const draft = emptyDraft(kind)
  if (value === null || value === undefined) return draft
  if (kind === 'boolean') return { ...draft, checked: value === true }
  if (kind === 'number') return { ...draft, text: typeof value === 'number' ? String(value) : '' }
  if (kind === 'string') return { ...draft, text: typeof value === 'string' ? value : '' }
  return {
    ...draft,
    items: Array.isArray(value) ? value.map((item) => String(item)) : [],
  }
}

/**
 * Locale-tolerant numeric parsing that never reinterprets digits.
 *
 * A decimal comma is accepted (Russian input), thousands separators are not, and
 * anything that is not a plain finite decimal is rejected instead of rounded.
 */
export function parseNumberText(text: string): number | null {
  const raw = text.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!raw) return null
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** Formats a stored number for the numeric editor without grouping. */
export function formatNumberDraft(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

/**
 * Convert one draft into the JSON value the API expects.
 *
 * An empty draft is "absent" (`ok: false, issue: 'required'` only when the
 * definition is required) and is omitted from the payload by the caller.
 */
export function draftToValue(
  definition: CharacteristicDefinitionLike,
  draft: CharacteristicDraft | undefined,
): DraftResult | null {
  const kind = fieldTypeOf(definition.data_type)
  const current = draft ?? emptyDraft(kind)
  const blank = (): DraftResult | null =>
    definition.is_required ? { ok: false, issue: 'required' } : null

  if (kind === 'boolean') return { ok: true, value: current.checked }

  if (kind === 'string') {
    const text = current.text.trim()
    if (!text) return blank()
    if (text.length > MAX_TEXT_LENGTH) return { ok: false, issue: 'too_long' }
    return { ok: true, value: text }
  }

  if (kind === 'number') {
    const text = current.text.trim()
    if (!text) return blank()
    const value = parseNumberText(text)
    if (value === null) return { ok: false, issue: 'number' }
    return { ok: true, value }
  }

  const rows = current.items.map((row) => row.trim()).filter((row) => row.length > 0)
  if (rows.length === 0) return blank()
  if (rows.length > MAX_LIST_ROWS) return { ok: false, issue: 'too_long' }
  if (kind === 'string_list') {
    if (rows.some((row) => row.length > MAX_TEXT_LENGTH)) {
      return { ok: false, issue: 'too_long' }
    }
    return { ok: true, value: rows }
  }
  const numbers = rows.map(parseNumberText)
  if (numbers.some((value) => value === null)) return { ok: false, issue: 'number' }
  return { ok: true, value: numbers as number[] }
}

export function isDraftEmpty(draft: CharacteristicDraft | undefined): boolean {
  if (!draft) return true
  if (draft.kind === 'boolean') return draft.checked === false
  if (draft.kind === 'string' || draft.kind === 'number') return !draft.text.trim()
  return draft.items.every((row) => !row.trim())
}

/** Codes that a stored product keeps but the target category no longer defines. */
export function orphanCodes(
  storedCodes: readonly string[],
  definitions: readonly CharacteristicDefinitionLike[],
): string[] {
  const known = new Set(definitions.map((definition) => definition.code))
  return storedCodes.filter((code) => !known.has(code))
}
