/**
 * Editor drafts for category-scoped product characteristics.
 *
 * Every selectable value comes from the server dictionary
 * (`characteristic_options`), so a draft stores **option ids** and a repeat count
 * — never free text. The only exception is the GPU `dimensions_mm` field, which
 * is edited as three measurements and canonicalised by the backend.
 *
 * Drafts are converted to the API payload only at submit time, so the
 * unchanged / replaced / explicitly-removed distinction stays intact until then.
 */

export type CharacteristicEditor =
  | 'select'
  | 'boolean'
  | 'multiselect'
  | 'connector_quantity'
  | 'dimensions'

/** One selectable dictionary value offered by the definitions endpoint. */
export interface CharacteristicOptionLike {
  option_id: number
  value: string
}

/** The subset of the generated definition schema the editor needs. */
export interface CharacteristicDefinitionLike {
  code: string
  name: string
  data_type: string
  editor: string
  unit?: string | null
  sort_order: number
  is_required: boolean
  show_in_short: boolean
  show_in_details: boolean
  options?: readonly CharacteristicOptionLike[]
  limits?: {
    max_selections: number
    max_quantity: number
    repeatable: boolean
  } | null
}

/** Ordered measurements of the dimensions editor. */
export type DimensionInputs = [string, string, string]

export interface CharacteristicDraft {
  editor: CharacteristicEditor
  /** Selected option ids, in selection order (one id for scalar editors). */
  selected: number[]
  /** Repeat count per option id; only `connector_quantity` uses values above 1. */
  quantities: Record<number, number>
  /** Raw text of the three dimension inputs, in length/width/height order. */
  dimensions: DimensionInputs
  /**
   * Whether the administrator actually edited this characteristic.
   *
   * The draft alone cannot answer that: a stored value is hydrated into a draft
   * that looks exactly like a cleared field. Only an edit intent recorded here may
   * turn an empty draft into a deletion, so hydrating, switching category or
   * editing an unrelated field never deletes a stored value.
   */
  edited: boolean
}

export type DraftIssue = 'required' | 'quantity' | 'dimension'

export type CharacteristicValueDraft =
  | { code: string; options: { option_id: number; quantity: number }[] }
  | { code: string; dimensions: number[] }

export type DraftResult =
  | { ok: true; value: CharacteristicValueDraft }
  | { ok: false; issue: DraftIssue }

export const MAX_QUANTITY = 32
export const DIMENSION_COUNT = 3
export const MAX_DIMENSION_MM = 1000
export const DIMENSION_DECIMAL_PLACES = 2
export const DIMENSION_UNIT = 'мм'

/** Accepted editors; anything else falls back to a single dictionary choice. */
const EDITORS: readonly CharacteristicEditor[] = [
  'select',
  'boolean',
  'multiselect',
  'connector_quantity',
  'dimensions',
]

export function editorOf(definition: {
  editor?: string | null
  data_type: string
}): CharacteristicEditor {
  const editor = definition.editor
  if (editor && EDITORS.includes(editor as CharacteristicEditor)) {
    return editor as CharacteristicEditor
  }
  return definition.data_type === 'boolean' ? 'boolean' : 'select'
}

/** Whether one option may carry a quantity greater than one. */
export function isRepeatable(editor: CharacteristicEditor): boolean {
  return editor === 'connector_quantity'
}

export function emptyDimensions(): DimensionInputs {
  return ['', '', '']
}

export function emptyDraft(definition: {
  editor?: string | null
  data_type: string
}): CharacteristicDraft {
  return {
    editor: editorOf(definition),
    selected: [],
    quantities: {},
    dimensions: emptyDimensions(),
    edited: false,
  }
}

/**
 * Strict numeric parsing of one dimension measurement.
 *
 * A single decimal comma is accepted and normalised to a point, because that is
 * the locale the editor renders. Everything else — exponent notation, grouping
 * separators, embedded whitespace, signs, more than two decimals — is rejected
 * instead of being repaired, so `1 2` never silently becomes `12`.
 */
export function parseDimensionText(text: string): number | null {
  const raw = text.trim()
  if (!raw) return null
  const normalized = raw.replace(',', '.')
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DIMENSION_MM) return null
  return value
}

/** The text an editor shows for one stored measurement. */
export function formatDimensionText(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  const rounded = Number(value.toFixed(DIMENSION_DECIMAL_PLACES))
  return String(rounded)
}

/**
 * The three input texts of a stored dimensions value.
 *
 * The API returns the ordered triple in `value`; the canonical display string is
 * only a fallback for a response that carries no structured triple.
 */
export function dimensionInputsFrom(
  value: unknown,
  displayValue?: string | null,
): DimensionInputs {
  const numbers = Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : []
  if (numbers.length === DIMENSION_COUNT) {
    return numbers.map(formatDimensionText) as DimensionInputs
  }
  const text = (displayValue ?? '').replace(` ${DIMENSION_UNIT}`, '')
  const parts = text.split('×').map((part) => part.trim())
  if (parts.length === DIMENSION_COUNT && parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) {
    return parts as DimensionInputs
  }
  return emptyDimensions()
}

/** One stored dictionary selection of a product characteristic. */
export interface StoredOption {
  optionId: number
  quantity: number
}

/** A characteristic value exactly as the API currently stores it. */
export interface StoredCharacteristic {
  options: StoredOption[]
  /** Data type declared by the definition the stored row belongs to. */
  dataType: string
}

/** Server-confirmed values keyed by characteristic code. */
export type StoredCharacteristics = Readonly<Record<string, StoredCharacteristic>>

/**
 * Draft for a stored value coming back from the API.
 *
 * The result is never `edited`: hydrating a value is not an action of the
 * administrator and must not authorize a removal.
 */
export function draftFromStored(
  definition: { editor?: string | null; data_type: string },
  stored: StoredCharacteristic | undefined,
  value?: unknown,
  displayValue?: string | null,
): CharacteristicDraft {
  const editor = editorOf(definition)
  const draft = emptyDraft(definition)
  if (editor === 'dimensions') {
    return { ...draft, dimensions: dimensionInputsFrom(value, displayValue) }
  }
  if (!stored) return draft
  return {
    ...draft,
    selected: stored.options.map((option) => option.optionId),
    quantities: Object.fromEntries(
      stored.options.map((option) => [option.optionId, option.quantity]),
    ),
  }
}

export function isDraftEmpty(draft: CharacteristicDraft | undefined): boolean {
  if (!draft) return true
  if (draft.editor === 'dimensions') {
    return draft.dimensions.every((text) => !text.trim())
  }
  return draft.selected.length === 0
}

/** Issues that belong to one characteristic rather than to the whole form. */
export function draftToValue(
  definition: CharacteristicDefinitionLike,
  draft: CharacteristicDraft | undefined,
): DraftResult | null {
  const editor = editorOf(definition)
  const current = draft ?? emptyDraft(definition)
  const blank = (): DraftResult | null =>
    definition.is_required ? { ok: false, issue: 'required' } : null

  if (editor === 'dimensions') {
    const texts = current.dimensions
    if (texts.every((text) => !text.trim())) return blank()
    const measurements = texts.map(parseDimensionText)
    if (measurements.some((value) => value === null)) {
      return { ok: false, issue: 'dimension' }
    }
    return {
      ok: true,
      value: { code: definition.code, dimensions: measurements as number[] },
    }
  }

  // Duplicated ids are collapsed; an id the dictionary no longer offers is kept
  // so the server can reject it explicitly instead of losing it silently.
  const selected = [...new Set(current.selected)]
  if (selected.length === 0) return blank()
  const maxSelections = definition.limits?.max_selections
  if (typeof maxSelections === 'number' && selected.length > maxSelections) {
    return { ok: false, issue: 'quantity' }
  }
  const repeatable = isRepeatable(editor)
  const options = selected.map((optionId) => {
    const quantity = repeatable ? current.quantities[optionId] ?? 1 : 1
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return null
    }
    return { option_id: optionId, quantity }
  })
  if (options.some((option) => option === null)) {
    return { ok: false, issue: 'quantity' }
  }
  // An option that is no longer offered is still submitted, so the API returns a
  // clear error rather than the form quietly dropping a stored selection.
  return {
    ok: true,
    value: {
      code: definition.code,
      options: options as { option_id: number; quantity: number }[],
    },
  }
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
  // another data type, are both unusable: neither is dropped nor reinterpreted
  // silently.
  return Object.entries(stored)
    .filter(([code, entry]) => types.get(code) !== entry.dataType)
    .map(([code]) => code)
}

/**
 * Outcome of converting every draft of a category into an API payload.
 *
 * The states of a characteristic are kept apart:
 *
 * - never provided and never stored → neither submitted nor removed;
 * - a valid selection → submitted through `values`;
 * - an existing value the administrator cleared → `removals`, which the API
 *   deletes explicitly. Omission alone can never delete anything, and hydration
 *   alone never counts as clearing;
 * - an unusable value of a previous category without a decision → `unresolved`,
 *   which blocks submission until the administrator replaces or confirms it.
 */
export interface CharacteristicPayload {
  values: CharacteristicValueDraft[]
  removals: string[]
  issues: Record<string, DraftIssue>
  /** Display names of required characteristics that carry no value. */
  missing: string[]
  /** Transition codes that still need a decision. */
  unresolved: string[]
}

export interface CharacteristicPayloadOptions {
  /** Stored codes whose removal the administrator confirmed for this transition. */
  removeCodes?: readonly string[]
  /** Stored codes a category transition makes unusable. */
  transitionCodes?: readonly string[]
}

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
      // value the category still accepts.
      if (draft?.edited === true) removals.push(code)
      continue
    }
    if (!result.ok) {
      if (result.issue === 'required') missing.push(definition.name)
      else issues[code] = result.issue
      continue
    }
    values.push(result.value)
  }

  // A confirmed code outside the target definitions is removed here, so a
  // confirmation can never delete a value the target category still renders. But
  // an unconfirmed code outside them is a transition that still needs a decision:
  // dropping it silently would lose a stored characteristic.
  const definitionCodes = new Set(definitions.map((definition) => definition.code))
  for (const code of removeCodes) {
    if (!definitionCodes.has(code) && !removals.includes(code)) removals.push(code)
  }
  for (const code of transitionCodes) {
    if (definitionCodes.has(code)) continue
    if (!Object.hasOwn(stored, code)) continue
    if (removals.includes(code) || unresolved.includes(code)) continue
    unresolved.push(code)
  }
  return { values, removals, issues, missing, unresolved }
}
