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
  orphanCodes,
  parseDimensionText,
  type CharacteristicDefinitionLike,
  type CharacteristicDraft,
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
