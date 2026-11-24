import { describe, expect, it } from 'vitest'
import {
  buildCharacteristicPayload,
  draftFromValue,
  draftToValue,
  emptyDraft,
  fieldTypeOf,
  isDraftEmpty,
  orphanCodes,
  parseNumberText,
  storedValueMap,
  type CharacteristicDefinitionLike,
} from './characteristicDrafts'

const definition = (
  code: string,
  data_type: string,
  is_required = false,
): CharacteristicDefinitionLike => ({
  code,
  name: code,
  data_type,
  unit: null,
  sort_order: 0,
  is_required,
  show_in_short: false,
  show_in_details: true,
})

describe('characteristic editor drafts', () => {
  it('maps every supported data type to the right control kind', () => {
    expect(fieldTypeOf('string')).toBe('string')
    expect(fieldTypeOf('number')).toBe('number')
    expect(fieldTypeOf('boolean')).toBe('boolean')
    expect(fieldTypeOf('string_list')).toBe('string_list')
    expect(fieldTypeOf('number_list')).toBe('number_list')
    // An unknown declaration never silently becomes a numeric control.
    expect(fieldTypeOf('mystery')).toBe('string')
  })

  it('round-trips every data type through a draft', () => {
    expect(draftToValue(definition('a', 'string'), draftFromValue('string', 'AM5')))
      .toEqual({ ok: true, value: 'AM5' })
    expect(draftToValue(definition('a', 'number'), draftFromValue('number', 3.4)))
      .toEqual({ ok: true, value: 3.4 })
    expect(draftToValue(definition('a', 'boolean'), draftFromValue('boolean', false)))
      .toEqual({ ok: true, value: false })
    expect(draftToValue(definition('a', 'string_list'), draftFromValue('string_list', ['8pin', '8pin'])))
      .toEqual({ ok: true, value: ['8pin', '8pin'] })
    expect(draftToValue(definition('a', 'number_list'), draftFromValue('number_list', [60, 80])))
      .toEqual({ ok: true, value: [60, 80] })
  })

  it('keeps list order and duplicates instead of splitting on commas', () => {
    const draft = { ...emptyDraft('string_list'), items: ['pcie-8pin', 'pcie-16pin', 'pcie-8pin'] }
    expect(draftToValue(definition('a', 'string_list'), draft)).toEqual({
      ok: true,
      value: ['pcie-8pin', 'pcie-16pin', 'pcie-8pin'],
    })
  })

  it('treats false and zero as real values, not as absences', () => {
    expect(draftToValue(definition('a', 'boolean'), { ...emptyDraft('boolean'), checked: false }))
      .toEqual({ ok: true, value: false })
    expect(draftToValue(definition('a', 'number'), { ...emptyDraft('number'), text: '0' }))
      .toEqual({ ok: true, value: 0 })
    expect(isDraftEmpty({ ...emptyDraft('number'), text: '0' })).toBe(false)
  })

  it('keeps an empty optional draft out of the payload', () => {
    expect(draftToValue(definition('a', 'string'), emptyDraft('string'))).toBeNull()
    expect(draftToValue(definition('a', 'string_list'), emptyDraft('string_list'))).toBeNull()
    // …but an empty required draft is reported.
    expect(draftToValue(definition('a', 'string', true), emptyDraft('string')))
      .toEqual({ ok: false, issue: 'required' })
  })

  it('rejects non-numeric text instead of guessing a number', () => {
    expect(draftToValue(definition('a', 'number'), { ...emptyDraft('number'), text: 'много' }))
      .toEqual({ ok: false, issue: 'number' })
    expect(draftToValue(definition('a', 'number'), { ...emptyDraft('number'), text: '1 2' }))
      .toEqual({ ok: false, issue: 'number' })
    expect(parseNumberText('1,5')).toBe(1.5)
    expect(parseNumberText('1.5')).toBe(1.5)
    expect(parseNumberText('1,234.5')).toBeNull()
    expect(parseNumberText('')).toBeNull()
  })

  it('never changes the meaning of a numeric value', () => {
    const accepted: Array<[string, number]> = [
      ['12', 12], ['12.5', 12.5], ['12,5', 12.5], ['0', 0], ['-2.5', -2.5],
      [' 12 ', 12], ['\t12,25\n', 12.25], ['-0.5', -0.5], ['0,0', 0],
      // A single comma is a decimal separator, never a grouping separator.
      ['1,234', 1.234],
    ]
    for (const [input, expected] of accepted) {
      expect(parseNumberText(input), input).toBe(expected)
    }

    const rejected = [
      '1 2', '1\u00a02', '1\u202f2', '1,234.5', '1.234,5', '1 234',
      'abc', 'Infinity', '-Infinity', 'NaN', '1e3', '1E3', '0x10', '+5',
      '12.', ',5', '12,', '12,5,5', '12.5.5', '--5', '', '   ',
    ]
    for (const input of rejected) {
      expect(parseNumberText(input), JSON.stringify(input)).toBeNull()
    }
  })

  it('applies the same strict rules to numeric list entries', () => {
    const zeros = { ...emptyDraft('number_list'), items: ['0', '-2,5'] }
    expect(draftToValue(definition('a', 'number_list'), zeros)).toEqual({ ok: true, value: [0, -2.5] })
    const spaced = { ...emptyDraft('number_list'), items: ['1 2'] }
    expect(draftToValue(definition('a', 'number_list'), spaced)).toEqual({ ok: false, issue: 'number' })
  })

  it('keeps an unset boolean distinct from an explicit false', () => {
    expect(emptyDraft('boolean').checked).toBeNull()
    expect(isDraftEmpty(emptyDraft('boolean'))).toBe(true)
    // An optional boolean that was never set is absent, not `false`…
    expect(draftToValue(definition('a', 'boolean'), emptyDraft('boolean'))).toBeNull()
    // …while an explicit choice round-trips in both directions.
    expect(draftToValue(definition('a', 'boolean'), draftFromValue('boolean', false)))
      .toEqual({ ok: true, value: false })
    expect(draftToValue(definition('a', 'boolean'), draftFromValue('boolean', true)))
      .toEqual({ ok: true, value: true })
    // A required boolean rejects the unset state instead of inventing `false`.
    expect(draftToValue(definition('a', 'boolean', true), emptyDraft('boolean')))
      .toEqual({ ok: false, issue: 'required' })
    expect(draftToValue(definition('a', 'boolean', true), { ...emptyDraft('boolean'), checked: false }))
      .toEqual({ ok: true, value: false })
    // A stored boolean false is read back as false, not as "absent".
    expect(isDraftEmpty(draftFromValue('boolean', false))).toBe(false)
  })

  it('rejects a non-numeric row inside a number list', () => {
    const draft = { ...emptyDraft('number_list'), items: ['60', 'abc'] }
    expect(draftToValue(definition('a', 'number_list'), draft)).toEqual({ ok: false, issue: 'number' })
  })

  it('drops blank list rows without reordering real values', () => {
    const draft = { ...emptyDraft('string_list'), items: ['8pin', '  ', '16pin'] }
    expect(draftToValue(definition('a', 'string_list'), draft)).toEqual({
      ok: true,
      value: ['8pin', '16pin'],
    })
  })

  it('reports stored codes the target category cannot reuse as-is', () => {
    const definitions = [definition('socket', 'string'), definition('cores', 'number')]
    const stored = {
      socket: { value: 'AM5', dataType: 'string' },
      chipset: { value: 'B650', dataType: 'string' },
      cores: { value: 8, dataType: 'number' },
    }
    // `chipset` is not defined by the target category.
    expect(orphanCodes(stored, definitions)).toEqual(['chipset'])
    expect(orphanCodes({}, definitions)).toEqual([])
  })

  it('reports a stored value whose data type changed in the target category', () => {
    // `memory_type` is a `string_list` for CPUs and a `string` for motherboards.
    const boardDefinitions = [definition('memory_type', 'string')]
    const cpuValue = { memory_type: { value: ['ddr5'], dataType: 'string_list' } }
    expect(orphanCodes(cpuValue, boardDefinitions)).toEqual(['memory_type'])
    // The motherboard's own value is reusable, so nothing has to be decided.
    expect(orphanCodes(
      { memory_type: { value: 'ddr5', dataType: 'string' } },
      boardDefinitions,
    )).toEqual([])
  })

  it('keeps stored values addressable as the payload builder map', () => {
    const stored = {
      memory_type: { value: 'ddr5', dataType: 'string' },
      cores: { value: 0, dataType: 'number' },
    }
    expect(storedValueMap(stored)).toEqual({ memory_type: 'ddr5', cores: 0 })
  })
})

describe('characteristic payload with explicit removals', () => {
  const definitions = [
    definition('socket', 'string', true),
    definition('cores', 'number'),
    definition('has_igpu', 'boolean'),
    definition('connectors', 'string_list'),
  ]

  const draftsFrom = (stored: Record<string, unknown>) =>
    Object.fromEntries(
      definitions
        .filter((field) => Object.hasOwn(stored, field.code))
        .map((field) => [field.code, draftFromValue(field.data_type, stored[field.code])]),
    )

  it('submits every valid value and removes nothing when the product is unchanged', () => {
    const stored = { socket: 'AM5', cores: 0, has_igpu: false, connectors: ['pcie-8pin'] }
    const payload = buildCharacteristicPayload(definitions, draftsFrom(stored), stored)
    expect(payload.removals).toEqual([])
    expect(payload.missing).toEqual([])
    expect(payload.issues).toEqual({})
    expect(payload.values).toEqual([
      { code: 'socket', value: 'AM5' },
      { code: 'cores', value: 0 },
      { code: 'has_igpu', value: false },
      { code: 'connectors', value: ['pcie-8pin'] },
    ])
  })

  it('turns a cleared stored value into an explicit removal', () => {
    const stored = { socket: 'AM5', cores: 6, has_igpu: true, connectors: ['pcie-8pin'] }
    const drafts = draftsFrom(stored)
    drafts.cores = { ...emptyDraft('number'), text: '' }
    drafts.has_igpu = { ...emptyDraft('boolean'), checked: null }
    drafts.connectors = { ...emptyDraft('string_list'), items: [] }

    const payload = buildCharacteristicPayload(definitions, drafts, stored)
    expect(payload.removals).toEqual(['cores', 'has_igpu', 'connectors'])
    expect(payload.values).toEqual([{ code: 'socket', value: 'AM5' }])
    // A code can never be both replaced and removed.
    const submitted = new Set(payload.values.map((entry) => entry.code))
    expect(payload.removals.filter((code) => submitted.has(code))).toEqual([])
  })

  it('never removes a characteristic that the product does not store', () => {
    const payload = buildCharacteristicPayload(
      definitions,
      { socket: { ...emptyDraft('string'), text: 'AM5' } },
      {},
    )
    expect(payload.removals).toEqual([])
    expect(payload.values).toEqual([{ code: 'socket', value: 'AM5' }])
  })

  it('keeps unspecified existing values out of both arrays', () => {
    const stored = { socket: 'AM5', cores: 8 }
    // `cores` has no draft at all: the administrator did not touch it.
    const payload = buildCharacteristicPayload(definitions, draftsFrom({ socket: 'AM5' }), stored)
    expect(payload.values).toEqual([{ code: 'socket', value: 'AM5' }])
    expect(payload.removals).toEqual([])
  })

  it('blocks a required characteristic from being cleared', () => {
    const stored = { socket: 'AM5' }
    const payload = buildCharacteristicPayload(
      definitions,
      { socket: { ...emptyDraft('string'), text: '  ' } },
      stored,
    )
    expect(payload.missing).toEqual(['socket'])
    expect(payload.removals).toEqual([])
    expect(payload.values).toEqual([])
  })

  it('removes previous-category codes only when they are explicitly confirmed', () => {
    const stored = { socket: 'AM5', chipset: 'B650' }
    const payload = buildCharacteristicPayload(
      definitions,
      draftsFrom({ socket: 'AM5' }),
      stored,
      { removeCodes: ['chipset'] },
    )
    expect(payload.removals).toEqual(['chipset'])
    expect(payload.values).toEqual([{ code: 'socket', value: 'AM5' }])
  })

  it('reports value issues per code without submitting the invalid value', () => {
    const drafts = {
      socket: { ...emptyDraft('string'), text: 'AM5' },
      cores: { ...emptyDraft('number'), text: '1 2' },
    }
    const payload = buildCharacteristicPayload(definitions, drafts, {})
    expect(payload.issues).toEqual({ cores: 'number' })
    expect(payload.values).toEqual([{ code: 'socket', value: 'AM5' }])
  })
})
