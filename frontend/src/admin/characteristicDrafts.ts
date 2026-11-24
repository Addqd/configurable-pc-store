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
  /**
   * State of a `boolean` value: `true`, `false`, or `null` for "not set".
   *
   * A boolean has three distinct states in the database (absent, true, false),
   * so an unchecked box must never be read as an explicit `false`.
   */
  checked: boolean | null
  /** Rows of a `string_list` / `number_list` value, in entered order. */
  items: string[]
  /**
   * Whether the administrator actually edited this characteristic.
   *
   * The draft alone cannot answer that: a stored value is hydrated into a draft
   * that looks exactly like a cleared field (an explicitly stored empty list `[]`
   * hydrates to zero rows, just like a field the administrator emptied). Only an
   * edit intent recorded here may turn an empty draft into a deletion, so
   * hydrating, switching category or editing an unrelated field never deletes a
   * stored value.
   */
  edited: boolean
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
  return { kind: fieldTypeOf(dataType), text: '', checked: null, items: [], edited: false }
}

/**
 * Draft for a stored value coming back from the API.
 *
 * The result is never `edited`: hydrating a value is not an action of the
 * administrator and must not authorize a removal.
 */
export function draftFromValue(dataType: string, value: unknown): CharacteristicDraft {
  const kind = fieldTypeOf(dataType)
  const draft = emptyDraft(kind)
  if (value === null || value === undefined) return draft
  if (kind === 'boolean') return { ...draft, checked: value === true ? true : value === false ? false : null }
  if (kind === 'number') return { ...draft, text: typeof value === 'number' ? String(value) : '' }
  if (kind === 'string') return { ...draft, text: typeof value === 'string' ? value : '' }
  return {
    ...draft,
    items: Array.isArray(value) ? value.map((item) => String(item)) : [],
  }
}

/**
 * Strict numeric parsing that never changes the meaning of the input.
 *
 * Exactly two decimal separators are accepted — `.` and `,` — and neither may
 * appear twice. Surrounding whitespace is ignored; whitespace *inside* a number,
 * grouping separators (`1 234`, `1,234.5`), exponent notation, `NaN`/`Infinity`
 * and any other notation are rejected instead of being guessed, because removing
 * or reinterpreting a character would silently change the stored value.
 */
export function parseNumberText(text: string): number | null {
  const raw = text.trim()
  if (!raw) return null
  // `-` is allowed; `+`, grouping and exponent notation are not plain decimals.
  if (!/^-?\d+(?:[.,]\d+)?$/.test(raw)) return null
  const value = Number(raw.replace(',', '.'))
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

  if (kind === 'boolean') {
    // `null` is "not set": a required boolean needs an explicit true or false.
    if (current.checked === null || current.checked === undefined) return blank()
    return { ok: true, value: current.checked }
  }

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
  if (draft.kind === 'boolean') return draft.checked === null || draft.checked === undefined
  if (draft.kind === 'string' || draft.kind === 'number') return !draft.text.trim()
  return draft.items.every((row) => !row.trim())
}

/** A characteristic value exactly as the API currently stores it. */
export interface StoredCharacteristic {
  value: unknown
  /** Data type declared by the definition the stored row belongs to. */
  dataType: string
}

/** Server-confirmed values keyed by characteristic code. */
export type StoredCharacteristics = Readonly<Record<string, StoredCharacteristic>>

/** Plain value map of `stored`, as the payload builder expects it. */
export function storedValueMap(
  stored: StoredCharacteristics,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(stored).map(([code, entry]) => [code, entry.value]),
  )
}

/** Codes that a stored product keeps but the target category cannot reuse as-is. */
export function orphanCodes(
  stored: StoredCharacteristics,
  definitions: readonly CharacteristicDefinitionLike[],
): string[] {
  const types = new Map(
    definitions.map((definition) => [definition.code, definition.data_type]),
  )
  // A code the target category does not define at all, and a code it defines with
  // another data type (`string_list` in the previous category, `string` in the new
  // one), are both unusable: neither is dropped nor reinterpreted silently.
  return Object.entries(stored)
    .filter(([code, entry]) => types.get(code) !== entry.dataType)
    .map(([code]) => code)
}

/** One submitted `characteristics` entry. */
export interface CharacteristicValueDraft {
  code: string
  value: unknown
}

/**
 * Outcome of converting every draft of a category into an API payload.
 *
 * The states of a characteristic are kept apart:
 *
 * - never provided and never stored → neither submitted nor removed;
 * - a valid value → submitted through `values`;
 * - an existing value the administrator cleared → `removals`, which the API
 *   deletes explicitly. Omission alone can never delete anything, and hydration
 *   alone never counts as clearing;
 * - an unusable value of a previous category without a decision → `unresolved`,
 *   which blocks submission until the administrator replaces or confirms it.
 */
export interface CharacteristicPayload {
  /** Values to create or replace. */
  values: CharacteristicValueDraft[]
  /** Stored codes the administrator cleared on purpose. */
  removals: string[]
  /** Per-code issues that are not about a required value. */
  issues: Record<string, DraftIssue>
  /** Display names of required characteristics that carry no value. */
  missing: string[]
  /**
   * Transition codes that still need a decision.
   *
   * The selected category cannot reuse the stored value and the administrator
   * neither submitted a valid replacement nor confirmed the removal, so the
   * transition is unresolved and must block submission.
   */
  unresolved: string[]
}

/**
 * Removal decisions the payload builder cannot make on its own.
 */
export interface CharacteristicPayloadOptions {
  /**
   * Stored codes whose removal the administrator confirmed for *this* transition.
   *
   * The caller owns the confirmation scope: a code listed here is removed, but
   * `transitionCodes` still decides whether a blank field may delete anything.
   */
  removeCodes?: readonly string[]
  /**
   * Stored codes a category transition makes unusable (the selected category
   * either does not define the code or declares another data type for it).
   *
   * Such a code is frozen until the transition is resolved: only a valid
   * replacement value or a confirmed removal may touch it, because an empty
   * field says nothing about a value the administrator never saw in this
   * category.
   */
  transitionCodes?: readonly string[]
}

/**
 * Builds the `characteristics` / `remove_characteristics` payload pair.
 *
 * `stored` holds the values currently persisted by the API, keyed by code, and is
 * never the same object as the editable drafts: only a code the server already
 * stores can be "cleared", and clearing it produces an explicit removal instead
 * of a silent omission. A code is never present in both arrays.
 *
 * `removeCodes` carries the removals the administrator confirmed for the current
 * category transition. A confirmed code that the selected category still defines
 * is removed here; a confirmed code outside `definitions` is added below.
 *
 * `transitionCodes` carries the stored codes that need such a confirmation. Their
 * empty draft is *not* a deletion request: it either becomes a confirmed removal
 * or an unresolved transition, never a silent deletion.
 */
export function buildCharacteristicPayload(
  definitions: readonly CharacteristicDefinitionLike[],
  drafts: Record<string, CharacteristicDraft | undefined>,
  stored: Readonly<Record<string, unknown>>,
  { removeCodes = [], transitionCodes = [] }: CharacteristicPayloadOptions = {},
): CharacteristicPayload {
  const values: CharacteristicValueDraft[] = []
  const removals: string[] = []
  const issues: Record<string, DraftIssue> = {}
  const missing: string[] = []
  const unresolved: string[] = []
  const confirmed = new Set(removeCodes)
  const needsTransition = new Set(transitionCodes)

  for (const definition of definitions) {
    const code = definition.code
    const draft = drafts[code]
    // An absent draft behaves exactly like an empty one (nothing typed yet), so
    // both are judged by the same rules below.
    const result = draftToValue(definition, draft)
    if (result === null) {
      if (!Object.hasOwn(stored, code)) continue
      if (needsTransition.has(code)) {
        // The stored value cannot be reused by the selected category. A blank
        // field is not a decision: either the removal was confirmed for this
        // transition, or the transition stays unresolved and blocks submission.
        if (confirmed.has(code)) removals.push(code)
        else unresolved.push(code)
        continue
      }
      // Only an edit of the administrator may delete a stored row — including a
      // value the category still accepts. A hydrated draft the user never touched
      // (a stored empty list, for example) keeps its stored value.
      if (draft?.edited === true) removals.push(code)
      continue
    }
    if (!result.ok) {
      if (result.issue === 'required') missing.push(definition.name)
      else issues[code] = result.issue
      continue
    }
    values.push({ code, value: result.value })
  }

  // A confirmed code the selected category still defines was decided per definition
  // above: either it carries a valid replacement, or it is reported as missing /
  // unresolved. Only codes outside the target definitions are removed here, so a
  // confirmation can never delete a value the target category requires.
  const definitionCodes = new Set(definitions.map((definition) => definition.code))
  for (const code of removeCodes) {
    if (!definitionCodes.has(code) && !removals.includes(code)) removals.push(code)
  }
  return { values, removals, issues, missing, unresolved }
}
