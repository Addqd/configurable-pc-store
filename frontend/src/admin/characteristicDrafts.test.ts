import { describe, expect, it } from 'vitest'
import {
  MAX_QUANTITY,
  buildCharacteristicPayload,
  dimensionInputsFrom,
  draftFromStored,
  draftToValue,
  editorOf,
  emptyDraft,
  isDraftEmpty,
  normalizeNumericText,
  numericAffixOf,
  numericDraftSchema,
  numericTextFromOptionValue,
  numericTextIssue,
  orphanCodes,
  parseDimensionText,
  pluralWord,
  type CharacteristicDefinitionLike,
  type CharacteristicDraft,
  type NumericLimitsInput,
  type StoredCharacteristic,
} from './characteristicDrafts'

const OPTIONS = [
  { option_id: 11, value: 'AM5' },
  { option_id: 12, value: 'AM4' },
]

function definition(
  overrides: Partial<CharacteristicDefinitionLike> & { code: string },
): CharacteristicDefinitionLike {
  return {
    name: overrides.code,
    data_type: 'string',
    editor: 'select',
    unit: null,
    sort_order: 0,
    is_required: false,
    show_in_short: false,
    show_in_details: true,
    options: OPTIONS,
    ...overrides,
  }
}

function drafted(patch: Partial<CharacteristicDraft>): CharacteristicDraft {
  return {
    editor: 'select',
    selected: [],
    quantities: {},
    dimensions: ['', '', ''],
    numericText: '',
    edited: true,
    ...patch,
  }
}

function stored(
  options: { optionId: number; quantity?: number }[],
  dataType = 'string',
): StoredCharacteristic {
  return {
    options: options.map((option) => ({
      optionId: option.optionId,
      quantity: option.quantity ?? 1,
    })),
    dataType,
  }
}

describe('editor selection', () => {
  it('uses the editor declared by the server for every definition', () => {
    expect(editorOf({ editor: 'select', data_type: 'string' })).toBe('select')
    expect(editorOf({ editor: 'boolean', data_type: 'boolean' })).toBe('boolean')
    expect(editorOf({ editor: 'multiselect', data_type: 'string_list' })).toBe('multiselect')
    expect(editorOf({ editor: 'connector_quantity', data_type: 'string_list' })).toBe(
      'connector_quantity',
    )
    expect(editorOf({ editor: 'dimensions', data_type: 'number_list' })).toBe('dimensions')
  })

  it('falls back safely when the server adds an editor this build does not know', () => {
    expect(editorOf({ editor: 'colour-wheel', data_type: 'string' })).toBe('select')
    expect(editorOf({ editor: undefined, data_type: 'boolean' })).toBe('boolean')
  })

  it('starts empty without a selection, quantities or measurements', () => {
    const draft = emptyDraft({ editor: 'connector_quantity', data_type: 'string_list' })
    expect(draft).toEqual({
      editor: 'connector_quantity',
      selected: [],
      quantities: {},
      dimensions: ['', '', ''],
      numericText: '',
      edited: false,
    })
    expect(isDraftEmpty(draft)).toBe(true)
  })
})

describe('hydrating an existing product', () => {
  it('restores the stored option ids and their quantities', () => {
    const draft = draftFromStored(
      { editor: 'connector_quantity', data_type: 'string_list' },
      stored([
        { optionId: 21, quantity: 4 },
        { optionId: 22, quantity: 1 },
      ]),
    )
    expect(draft.selected).toEqual([21, 22])
    expect(draft.quantities).toEqual({ 21: 4, 22: 1 })
    // Hydration is never an edit: it must not authorize a removal.
    expect(draft.edited).toBe(false)
  })

  it('restores the three dimension inputs from the ordered triple', () => {
    const draft = draftFromStored(
      { editor: 'dimensions', data_type: 'number_list' },
      undefined,
      [320, 134.85, 61.57],
      '320 × 134.85 × 61.57 мм',
    )
    expect(draft.dimensions).toEqual(['320', '134.85', '61.57'])
    expect(draft.edited).toBe(false)
  })

  it('parses the canonical display string when no triple is present', () => {
    expect(dimensionInputsFrom(null, '307 × 125 × 46 мм')).toEqual(['307', '125', '46'])
    expect(dimensionInputsFrom([1, 2], 'мусор')).toEqual(['', '', ''])
  })

  it('hydrates an unset boolean as an empty selection, not as false', () => {
    const draft = draftFromStored({ editor: 'boolean', data_type: 'boolean' }, undefined)
    expect(draft.selected).toEqual([])
    expect(isDraftEmpty(draft)).toBe(true)
  })
})

describe('dictionary-backed selections', () => {
  it('submits option ids, never free-text values', () => {
    const result = draftToValue(definition({ code: 'socket' }), drafted({ selected: [11] }))
    expect(result).toEqual({
      ok: true,
      value: { code: 'socket', options: [{ option_id: 11, quantity: 1 }] },
    })
  })

  it('keeps the repeat count of a connector selection', () => {
    const result = draftToValue(
      definition({
        code: 'required_power_connectors',
        editor: 'connector_quantity',
        data_type: 'string_list',
      }),
      drafted({ editor: 'connector_quantity', selected: [11], quantities: { 11: 4 } }),
    )
    expect(result).toEqual({
      ok: true,
      value: { code: 'required_power_connectors', options: [{ option_id: 11, quantity: 4 }] },
    })
  })

  it('rejects a quantity outside the supported range', () => {
    const field = definition({
      code: 'required_power_connectors',
      editor: 'connector_quantity',
      data_type: 'string_list',
    })
    expect(
      draftToValue(field, drafted({ editor: 'connector_quantity', selected: [11], quantities: { 11: 0 } })),
    ).toEqual({ ok: false, issue: 'quantity' })
    expect(
      draftToValue(
        field,
        drafted({
          editor: 'connector_quantity',
          selected: [11],
          quantities: { 11: MAX_QUANTITY + 1 },
        }),
      ),
    ).toEqual({ ok: false, issue: 'quantity' })
  })

  it('collapses a duplicated option id instead of submitting it twice', () => {
    const result = draftToValue(
      definition({ code: 'supported_sockets', editor: 'multiselect', data_type: 'string_list' }),
      drafted({ editor: 'multiselect', selected: [11, 11, 12] }),
    )
    expect(result).toEqual({
      ok: true,
      value: {
        code: 'supported_sockets',
        options: [
          { option_id: 11, quantity: 1 },
          { option_id: 12, quantity: 1 },
        ],
      },
    })
  })

  it('never invents an option id: only ids from the dictionary are selectable', () => {
    // The editor renders server options only, so a value that is not in the
    // dictionary cannot be produced by the control. A stored id the dictionary no
    // longer offers is still submitted so the API rejects it explicitly.
    const result = draftToValue(definition({ code: 'socket' }), drafted({ selected: [999] }))
    expect(result).toEqual({
      ok: true,
      value: { code: 'socket', options: [{ option_id: 999, quantity: 1 }] },
    })
  })

  it('reports a missing required value and an empty optional one', () => {
    expect(draftToValue(definition({ code: 'socket', is_required: true }), drafted({}))).toEqual({
      ok: false,
      issue: 'required',
    })
    expect(draftToValue(definition({ code: 'socket' }), drafted({}))).toBeNull()
  })
})

describe('dimensions', () => {
  const field = definition({
    code: 'dimensions_mm',
    editor: 'dimensions',
    data_type: 'number_list',
    unit: 'мм',
  })

  it('accepts exactly three valid measurements', () => {
    expect(
      draftToValue(field, drafted({ editor: 'dimensions', dimensions: ['307', '125', '46'] })),
    ).toEqual({ ok: true, value: { code: 'dimensions_mm', dimensions: [307, 125, 46] } })
  })

  it('normalizes a decimal comma but keeps the value identical', () => {
    expect(parseDimensionText('134,85')).toBe(134.85)
    expect(
      draftToValue(field, drafted({ editor: 'dimensions', dimensions: ['320', '134,85', '61,57'] })),
    ).toEqual({
      ok: true,
      value: { code: 'dimensions_mm', dimensions: [320, 134.85, 61.57] },
    })
  })

  it.each([
    ['1 2', 'embedded whitespace'],
    ['1e3', 'exponent notation'],
    ['1,234', 'grouping separator'],
    ['1.234', 'three decimals'],
    ['0', 'zero'],
    ['-1', 'negative'],
    ['1001', 'above the maximum'],
    ['abc', 'text'],
    ['', 'empty'],
  ])('rejects %s (%s) instead of repairing it', (text) => {
    expect(parseDimensionText(text)).toBeNull()
  })

  it('requires all three inputs', () => {
    expect(
      draftToValue(field, drafted({ editor: 'dimensions', dimensions: ['307', '', '46'] })),
    ).toEqual({ ok: false, issue: 'dimension' })
  })

  it('keeps an optional dimensions field optional but never half-filled', () => {
    expect(
      draftToValue(field, drafted({ editor: 'dimensions', dimensions: ['', '', ''] })),
    ).toBeNull()
  })
})

describe('unchanged, replaced and removed values', () => {
  const definitions = [
    definition({ code: 'socket', is_required: true }),
    definition({ code: 'chipset' }),
  ]

  it('does not remove a value the administrator did not touch', () => {
    const payload = buildCharacteristicPayload(
      definitions,
      { socket: draftFromStored(definitions[0], stored([{ optionId: 11 }])) },
      { socket: stored([{ optionId: 11 }]), chipset: stored([{ optionId: 12 }]) },
    )
    expect(payload.removals).toEqual([])
    expect(payload.unresolved).toEqual([])
    // Re-submitting the same option id is harmless and never a silent change.
    expect(payload.values).toEqual([
      { code: 'socket', options: [{ option_id: 11, quantity: 1 }] },
    ])
  })

  it('submits a replacement', () => {
    const payload = buildCharacteristicPayload(
      definitions,
      { chipset: drafted({ selected: [12] }) },
      { socket: stored([{ optionId: 11 }]), chipset: stored([{ optionId: 11 }]) },
    )
    expect(payload.values).toEqual([{ code: 'chipset', options: [{ option_id: 12, quantity: 1 }] }])
    expect(payload.removals).toEqual([])
  })

  it('removes a stored value only after an explicit edit', () => {
    const payload = buildCharacteristicPayload(
      definitions,
      { chipset: drafted({ selected: [] }) },
      { socket: stored([{ optionId: 11 }]), chipset: stored([{ optionId: 12 }]) },
    )
    expect(payload.removals).toEqual(['chipset'])
  })

  it('never removes a value that was only hydrated', () => {
    const payload = buildCharacteristicPayload(
      definitions,
      { chipset: { ...draftFromStored(definitions[1], stored([{ optionId: 12 }])), selected: [] } },
      { socket: stored([{ optionId: 11 }]), chipset: stored([{ optionId: 12 }]) },
    )
    expect(payload.removals).toEqual([])
  })

  it('reports every stored code with a missing required value', () => {
    const payload = buildCharacteristicPayload(definitions, {}, {})
    expect(payload.missing).toEqual(['socket'])
    expect(payload.values).toEqual([])
  })

  it('never sends a code both as a value and as a removal', () => {
    const payload = buildCharacteristicPayload(
      definitions,
      { chipset: drafted({ selected: [12] }) },
      { chipset: stored([{ optionId: 11 }]) },
      { removeCodes: ['chipset'] },
    )
    expect(payload.values.map((value) => value.code)).toEqual(['chipset'])
    expect(payload.removals).not.toContain('chipset')
  })
})

describe('category transitions', () => {
  const target = [definition({ code: 'socket', data_type: 'string' })]

  it('flags stored codes the target category cannot reuse', () => {
    expect(
      orphanCodes(
        { socket: stored([{ optionId: 11 }], 'string_list'), vram_gb: stored([{ optionId: 1 }], 'number') },
        target,
      ),
    ).toEqual(['socket', 'vram_gb'])
  })

  it('blocks the transition until every stored code is replaced or confirmed', () => {
    const payload = buildCharacteristicPayload(
      target,
      {},
      { socket: stored([{ optionId: 11 }]), vram_gb: stored([{ optionId: 1 }]) },
      { transitionCodes: ['socket', 'vram_gb'] },
    )
    expect(payload.unresolved).toEqual(['socket', 'vram_gb'])
    expect(payload.removals).toEqual([])
  })

  it('accepts a confirmed removal for the current transition only', () => {
    const payload = buildCharacteristicPayload(
      target,
      {},
      { socket: stored([{ optionId: 11 }]), vram_gb: stored([{ optionId: 1 }]) },
      { transitionCodes: ['socket', 'vram_gb'], removeCodes: ['vram_gb'] },
    )
    // `socket` is still unresolved: a confirmation never covers it implicitly.
    expect(payload.unresolved).toEqual(['socket'])
    expect(payload.removals).toEqual(['vram_gb'])
  })

  it('accepts a valid replacement of a transition code', () => {
    const payload = buildCharacteristicPayload(
      target,
      { socket: drafted({ selected: [12] }) },
      { socket: stored([{ optionId: 11 }]) },
      { transitionCodes: ['socket'] },
    )
    expect(payload.unresolved).toEqual([])
    expect(payload.values).toEqual([{ code: 'socket', options: [{ option_id: 12, quantity: 1 }] }])
  })
})

/* ── Editable numeric characteristics ─────────────────────────────────────── */

const LENGTH_LIMITS: NumericLimitsInput = {
  max_value: '1000',
  decimal_places: 2,
  style: 'suffix',
  affix: 'мм',
  plural_forms: null,
}

const LENGTH_OPTIONS = [
  { option_id: 61, value: '234.1 мм' },
  { option_id: 62, value: '305 мм' },
]

const numericDefinition = (
  overrides: Partial<CharacteristicDefinitionLike> = {},
): CharacteristicDefinitionLike =>
  definition({
    code: 'length_mm',
    name: 'Длина',
    data_type: 'number',
    editor: 'numeric',
    unit: 'мм',
    is_required: false,
    options: LENGTH_OPTIONS,
    limits: {
      max_selections: 1,
      max_quantity: 1,
      repeatable: false,
      numeric: LENGTH_LIMITS,
    },
    ...overrides,
  })

describe('numeric drafts', () => {
  it('reads the editable number out of the dictionary wording', () => {
    expect(numericTextFromOptionValue('305 мм')).toBe('305')
    expect(numericTextFromOptionValue('3.4 ГГц')).toBe('3.4')
    expect(numericTextFromOptionValue('CL36')).toBe('36')
    expect(numericTextFromOptionValue('24″')).toBe('24')
    expect(numericTextFromOptionValue('6 ядер')).toBe('6')
    expect(numericTextFromOptionValue('269,1 мм')).toBe('269.1')
    // The helper is only applied to a numeric definition, where a number always
    // exists; a categorical value never reaches it.
    expect(numericTextFromOptionValue('AM5')).toBe('5')
  })

  it('converts exactly one decimal comma and nothing else', () => {
    expect(normalizeNumericText('269,1')).toBe('269.1')
    expect(normalizeNumericText(' 750 ')).toBe('750')
    expect(normalizeNumericText('1,2,3')).toBe('1,2,3')
    expect(normalizeNumericText('1.234,5')).toBe('1.234,5')
    expect(normalizeNumericText('')).toBe('')
  })

  it('validates the text against the backend limits', () => {
    expect(numericTextIssue('269.1', LENGTH_LIMITS)).toBeNull()
    expect(numericTextIssue('269,1', LENGTH_LIMITS)).toBeNull()
    expect(numericTextIssue('1000', LENGTH_LIMITS)).toBeNull()
    expect(numericTextIssue('305.10', LENGTH_LIMITS)).toBeNull()
    expect(numericTextIssue('1001', LENGTH_LIMITS)).toBe('range')
    expect(numericTextIssue('0', LENGTH_LIMITS)).toBe('range')
    expect(numericTextIssue('-5', LENGTH_LIMITS)).toBe('format')
    expect(numericTextIssue('1.234', LENGTH_LIMITS)).toBe('precision')
    expect(numericTextIssue('1e3', LENGTH_LIMITS)).toBe('format')
    expect(numericTextIssue('1 2', LENGTH_LIMITS)).toBe('format')
    expect(numericTextIssue('305 мм', LENGTH_LIMITS)).toBe('format')
    expect(numericTextIssue('', LENGTH_LIMITS)).toBe('format')
  })

  it('rejects an integer field fraction through the same schema', () => {
    const integer: NumericLimitsInput = {
      max_value: '256',
      decimal_places: 0,
      style: 'prefix',
      affix: 'CL',
      plural_forms: null,
    }
    expect(numericDraftSchema(integer).safeParse('36').success).toBe(true)
    expect(numericDraftSchema(integer).safeParse('36.5').success).toBe(false)
    expect(numericDraftSchema(integer).safeParse('36.0').success).toBe(true)
  })

  it('builds the fixed affix of every style', () => {
    expect(numericAffixOf(LENGTH_LIMITS, '305')).toBe('мм')
    expect(numericAffixOf(LENGTH_LIMITS, '')).toBe('мм')
    expect(
      numericAffixOf(
        { max_value: '256', decimal_places: 0, style: 'prefix', affix: 'CL', plural_forms: null },
        '36',
      ),
    ).toBe('CL')
    expect(
      numericAffixOf(
        { max_value: '200', decimal_places: 2, style: 'symbol', affix: '″', plural_forms: null },
        '27',
      ),
    ).toBe('″')
    expect(
      numericAffixOf(
        {
          max_value: '1024',
          decimal_places: 0,
          style: 'suffix',
          affix: null,
          plural_forms: { one: 'ядро', few: 'ядра', many: 'ядер' },
        },
        '6',
      ),
    ).toBe('ядер')
    expect(numericAffixOf(LENGTH_LIMITS, '')).toBe('мм')
  })

  it('follows the Russian count word of a plural field', () => {
    const forms = { one: 'ядро', few: 'ядра', many: 'ядер' }
    expect(pluralWord(forms, 1)).toBe('ядро')
    expect(pluralWord(forms, 2)).toBe('ядра')
    expect(pluralWord(forms, 5)).toBe('ядер')
    expect(pluralWord(forms, 12)).toBe('ядер')
    expect(pluralWord(forms, 21)).toBe('ядро')
    expect(pluralWord(forms, 24)).toBe('ядра')
    expect(pluralWord(forms, 2.5)).toBe('ядра')
  })

  it('is empty only without text', () => {
    expect(isDraftEmpty(drafted({ editor: 'numeric', numericText: '' }))).toBe(true)
    expect(isDraftEmpty(drafted({ editor: 'numeric', numericText: '0' }))).toBe(false)
  })

  it('submits a typed number as a plain decimal string', () => {
    const result = draftToValue(
      numericDefinition(),
      drafted({ editor: 'numeric', numericText: '269,1' }),
    )
    expect(result).toEqual({
      ok: true,
      value: { code: 'length_mm', numeric_value: '269.1' },
    })
  })

  it('keeps the dictionary id of a picked option', () => {
    const result = draftToValue(
      numericDefinition(),
      drafted({ editor: 'numeric', numericText: '305', selected: [62] }),
    )
    expect(result).toEqual({
      ok: true,
      value: { code: 'length_mm', options: [{ option_id: 62, quantity: 1 }] },
    })
  })

  it('sends typed text as a number even when an option holds that magnitude', () => {
    // The administrator typed instead of picking: the backend reuses the option.
    const result = draftToValue(
      numericDefinition(),
      drafted({ editor: 'numeric', numericText: '305.0' }),
    )
    expect(result).toEqual({
      ok: true,
      value: { code: 'length_mm', numeric_value: '305.0' },
    })
  })

  it('reports an invalid number instead of repairing it', () => {
    expect(draftToValue(numericDefinition(), drafted({ editor: 'numeric', numericText: '1 2' }))).toEqual({
      ok: false,
      issue: 'numeric',
    })
    expect(draftToValue(numericDefinition(), drafted({ editor: 'numeric', numericText: '1234' }))).toEqual({
      ok: false,
      issue: 'numeric',
    })
  })

  it('requires a value when the definition is required', () => {
    expect(
      draftToValue(
        numericDefinition({ is_required: true }),
        drafted({ editor: 'numeric', numericText: '' }),
      ),
    ).toEqual({ ok: false, issue: 'required' })
    // An optional field stays untouched when it is blank.
    expect(draftToValue(numericDefinition(), drafted({ editor: 'numeric', numericText: '' }))).toBeNull()
  })

  it('hydrates the stored number and its option id', () => {
    const draft = draftFromStored(
      { editor: 'numeric', data_type: 'number' },
      {
        options: [{ optionId: 62, quantity: 1, value: '305 мм' }],
        dataType: 'number',
      },
      305,
      '305 мм',
    )
    expect(draft.numericText).toBe('305')
    expect(draft.selected).toEqual([62])
    expect(draft.edited).toBe(false)
  })

  it('hydrates a prefixed value from its dictionary wording', () => {
    const draft = draftFromStored(
      { editor: 'numeric', data_type: 'number' },
      {
        options: [{ optionId: 7, quantity: 1, value: 'CL36' }],
        dataType: 'number',
      },
      'CL36',
      'CL36',
    )
    expect(draft.numericText).toBe('36')
    expect(draft.selected).toEqual([7])
  })

  it('submits a cleared optional value as an explicit removal', () => {
    const definitions = [numericDefinition(), definition({ code: 'socket' })]
    const payload = buildCharacteristicPayload(
      definitions,
      {
        socket: drafted({ selected: [12] }),
        length_mm: drafted({ editor: 'numeric', numericText: '' }),
      },
      {
        socket: stored([{ optionId: 12 }]),
        length_mm: stored([{ optionId: 62 }], 'number'),
      },
    )
    expect(payload.removals).toEqual(['length_mm'])
    expect(payload.values).toEqual([{ code: 'socket', options: [{ option_id: 12, quantity: 1 }] }])
    expect(payload.issues).toEqual({})
  })
})
