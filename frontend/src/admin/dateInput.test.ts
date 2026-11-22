import { describe, expect, it } from 'vitest'
import { dateFromIso, dateFromText, maskDateText, textFromIso } from './dateInput'

describe('date filter masking', () => {
  it('inserts the separators while the date is typed', () => {
    const steps = ['0', '01', '011', '0111', '01112', '011120', '0111202', '01112026']
    expect(steps.map(maskDateText)).toEqual([
      '0', '01', '01.1', '01.11', '01.11.2', '01.11.20', '01.11.202', '01.11.2026',
    ])
  })

  it('keeps a pasted or pre-formatted value usable', () => {
    expect(maskDateText('01.11.2026')).toBe('01.11.2026')
    expect(maskDateText('01/11/2026')).toBe('01.11.2026')
    expect(maskDateText('  01 11 2026  ')).toBe('01.11.2026')
  })

  it('never produces a leading, trailing or doubled separator', () => {
    expect(maskDateText('')).toBe('')
    expect(maskDateText('.')).toBe('')
    expect(maskDateText('..01..11..2026..')).toBe('01.11.2026')
    expect(maskDateText('1.1.2026')).toBe('11.20.26')
  })

  it('caps the input at a complete date', () => {
    expect(maskDateText('011120269999')).toBe('01.11.2026')
  })

  it('shortens normally when characters are deleted', () => {
    expect(maskDateText('01.11.202')).toBe('01.11.202')
    expect(maskDateText('01.11.')).toBe('01.11')
    expect(maskDateText('01.')).toBe('01')
  })
})

describe('date filter parsing', () => {
  it('accepts a real calendar day', () => {
    const date = dateFromText('01.11.2026')
    expect(date).not.toBeNull()
    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(10)
    expect(date?.getDate()).toBe(1)
  })

  it('accepts a leap day only in a leap year', () => {
    expect(dateFromText('29.02.2024')).not.toBeNull()
    expect(dateFromText('29.02.2025')).toBeNull()
    expect(dateFromText('29.02.2026')).toBeNull()
  })

  it.each([
    ['31.02.2026', 'day outside the month'],
    ['32.01.2026', 'day above 31'],
    ['00.01.2026', 'day zero'],
    ['01.13.2026', 'month above 12'],
    ['01.00.2026', 'month zero'],
    ['12.11.0026', 'year below the supported range'],
  ])('rejects %s (%s)', (text) => {
    expect(dateFromText(text)).toBeNull()
  })

  it.each(['', '01', '01.11', '01.11.20', '1.1.2026', '01-11-2026'])(
    'rejects the incomplete value %s',
    (text) => {
      expect(dateFromText(text)).toBeNull()
    },
  )
})

describe('date filter ISO bridge', () => {
  it('round-trips a local calendar day without a timezone shift', () => {
    expect(textFromIso('2026-11-01')).toBe('01.11.2026')
    expect(textFromIso('2026-01-05')).toBe('05.01.2026')
    expect(textFromIso('')).toBe('')
    expect(textFromIso('2026-13-01')).toBe('')
    expect(textFromIso('not-a-date')).toBe('')
  })

  it('returns null for unusable ISO text', () => {
    expect(dateFromIso('')).toBeNull()
    expect(dateFromIso('2026-02-30')).toBeNull()
    expect(dateFromIso('11/01/2026')).toBeNull()
  })

  it('reads the ISO date as the same local day the calendar shows', () => {
    const date = dateFromIso('2026-11-01')
    expect(date?.getDate()).toBe(1)
    expect(date?.getMonth()).toBe(10)
    expect(date?.getFullYear()).toBe(2026)
  })
})
