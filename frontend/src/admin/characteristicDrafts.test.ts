import { describe, expect, it } from 'vitest'
import {
  draftFromValue,
  draftToValue,
  emptyDraft,
  fieldTypeOf,
  isDraftEmpty,
  orphanCodes,
  parseNumberText,
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
      .toEqual({ ok: true, value: 12 })
    expect(parseNumberText('1,5')).toBe(1.5)
    expect(parseNumberText('1.5')).toBe(1.5)
    expect(parseNumberText('1,234.5')).toBeNull()
    expect(parseNumberText('')).toBeNull()
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

  it('reports codes that the target category does not define', () => {
    const definitions = [definition('socket', 'string'), definition('cores', 'number')]
    expect(orphanCodes(['socket', 'chipset', 'cores'], definitions)).toEqual(['chipset'])
    expect(orphanCodes([], definitions)).toEqual([])
  })
})
