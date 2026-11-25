import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NumericComboBox, type NumericComboOption } from './NumericComboBox'
import type { NumericLimitsInput } from '../../admin/characteristicDrafts'

afterEach(() => cleanup())

const LENGTH_LIMITS: NumericLimitsInput = {
  max_value: '1000', decimal_places: 2, style: 'suffix', affix: 'мм', plural_forms: null,
}

/** Server-ordered dictionary: ascending numeric magnitude, not text order. */
const LENGTH_OPTIONS: NumericComboOption[] = [
  { option_id: 61, value: '234.1 мм' },
  { option_id: 62, value: '305 мм' },
  { option_id: 63, value: '357.6 мм' },
]

function Harness({
  limits = LENGTH_LIMITS,
  options = LENGTH_OPTIONS,
  initial = '',
  required = false,
  disabled = false,
  invalid = false,
  onPick = () => {},
  onClear = () => {},
}: {
  limits?: NumericLimitsInput
  options?: NumericComboOption[]
  initial?: string
  required?: boolean
  disabled?: boolean
  invalid?: boolean
  onPick?: (optionId: number, text: string) => void
  onClear?: () => void
}) {
  const [text, setText] = useState(initial)
  return (
    <NumericComboBox
      id="probe"
      name="Длина"
      text={text}
      limits={limits}
      options={options}
      disabled={disabled}
      invalid={invalid}
      required={required}
      onChangeText={setText}
      onPick={(optionId, numericText) => {
        setText(numericText)
        onPick(optionId, numericText)
      }}
      onClear={() => {
        setText('')
        onClear()
      }}
    />
  )
}

const combo = () => screen.getByRole('combobox', { name: 'Длина' }) as HTMLInputElement
const listedOptions = () =>
  [...document.querySelectorAll('#probe-listbox [role="option"]')].map((node) => node.textContent)

describe('NumericComboBox', () => {
  it('is one integrated control with the unit inside it', () => {
    render(<Harness />)
    const input = combo()
    expect(input.tagName).toBe('INPUT')
    // Exactly one editable field: no second search input for the dictionary.
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(document.querySelectorAll('input')).toHaveLength(1)
    expect(screen.getByText('мм')).toBeTruthy()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-controls')).toBe('probe-listbox')
    // Closed by default: no popup, no option-count label.
    expect(document.getElementById('probe-listbox')).toBeNull()
    expect(screen.queryByText(/Доступно значений/)).toBeNull()
  })

  it('opens on focus with the whole dictionary in server (magnitude) order', () => {
    render(<Harness initial="305" />)
    fireEvent.focus(combo())
    expect(combo().getAttribute('aria-expanded')).toBe('true')
    expect(listedOptions()).toEqual(['234.1 мм', '305 мм', '357.6 мм'])
  })

  it('filters the dictionary inside the popup while typing and keeps the text', () => {
    render(<Harness />)
    fireEvent.focus(combo())
    fireEvent.change(combo(), { target: { value: '35' } })
    expect(listedOptions()).toEqual(['357.6 мм'])
    fireEvent.change(combo(), { target: { value: '999' } })
    expect(listedOptions()).toEqual([])
    expect(screen.getByText('Нет подходящих значений')).toBeTruthy()
    // The typed text is never rewritten into something else.
    expect(combo().value).toBe('999')
  })

  it('picks an existing option with the mouse and reports its id', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    fireEvent.focus(combo())
    fireEvent.change(combo(), { target: { value: '305' } })
    fireEvent.click(screen.getByRole('option', { name: '305 мм' }))
    expect(onPick).toHaveBeenCalledWith(62, '305')
    expect(combo().value).toBe('305')
    expect(combo().getAttribute('aria-expanded')).toBe('false')
  })

  it('supports keyboard navigation and Enter selection', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    fireEvent.focus(combo())
    fireEvent.keyDown(combo(), { key: 'ArrowDown' })
    expect(combo().getAttribute('aria-activedescendant')).toBe('probe-listbox-option-0')
    fireEvent.keyDown(combo(), { key: 'ArrowDown' })
    expect(combo().getAttribute('aria-activedescendant')).toBe('probe-listbox-option-1')
    fireEvent.keyDown(combo(), { key: 'ArrowUp' })
    expect(combo().getAttribute('aria-activedescendant')).toBe('probe-listbox-option-0')
    fireEvent.keyDown(combo(), { key: 'End' })
    expect(combo().getAttribute('aria-activedescendant')).toBe('probe-listbox-option-2')
    fireEvent.keyDown(combo(), { key: 'Home' })
    fireEvent.keyDown(combo(), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(61, '234.1')
  })

  it('closes on Escape without committing and keeps the typed text', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    fireEvent.focus(combo())
    fireEvent.change(combo(), { target: { value: '777' } })
    fireEvent.keyDown(combo(), { key: 'ArrowDown' })
    fireEvent.keyDown(combo(), { key: 'Escape' })
    expect(onPick).not.toHaveBeenCalled()
    expect(combo().value).toBe('777')
    expect(combo().getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('probe-listbox')).toBeNull()
  })

  it('closes when clicking outside and never discards valid input', () => {
    render(
      <div>
        <Harness />
        <button type="button">Снаружи</button>
      </div>,
    )
    fireEvent.focus(combo())
    fireEvent.change(combo(), { target: { value: '269.1' } })
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Снаружи' }))
    expect(document.getElementById('probe-listbox')).toBeNull()
    expect(combo().value).toBe('269.1')
  })

  it('toggles the list with the chevron inside the control', () => {
    render(<Harness />)
    const toggle = screen.getByRole('button', { name: 'Показать или скрыть справочник' })
    fireEvent.click(toggle)
    expect(document.getElementById('probe-listbox')).not.toBeNull()
    fireEvent.click(toggle)
    expect(document.getElementById('probe-listbox')).toBeNull()
  })

  it('offers an explicit clear only for an optional filled field', () => {
    const onClear = vi.fn()
    render(<Harness initial="305" onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Очистить значение' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(combo().value).toBe('')
  })

  it('never offers to clear a required field', () => {
    render(<Harness initial="305" required />)
    expect(screen.queryByRole('button', { name: 'Очистить значение' })).toBeNull()
  })

  it('renders a fixed prefix in front of the editable number', () => {
    render(
      <Harness
        limits={{ max_value: '256', decimal_places: 0, style: 'prefix', affix: 'CL', plural_forms: null }}
        options={[{ option_id: 1, value: 'CL16' }, { option_id: 2, value: 'CL36' }]}
        initial="36"
      />,
    )
    const control = combo().parentElement as HTMLElement
    expect(control.firstElementChild?.textContent).toBe('CL')
    expect(combo().value).toBe('36')
  })

  it('renders the diagonal symbol after the number', () => {
    render(
      <Harness
        limits={{ max_value: '200', decimal_places: 2, style: 'symbol', affix: '″', plural_forms: null }}
        options={[{ option_id: 1, value: '27″' }]}
        initial="27"
      />,
    )
    const control = combo().parentElement as HTMLElement
    expect(screen.getByText('″')).toBeTruthy()
    // The symbol is a separate element; the input holds only the number.
    expect(control.textContent).not.toContain('27')
    expect(combo().value).toBe('27')
  })

  it('follows the count word of a plural field', () => {
    const forms = { one: 'ядро', few: 'ядра', many: 'ядер' }
    const limits: NumericLimitsInput = {
      max_value: '1024', decimal_places: 0, style: 'suffix', affix: null, plural_forms: forms,
    }
    render(<Harness limits={limits} options={[{ option_id: 1, value: '6 ядер' }]} initial="6" />)
    expect((combo().parentElement as HTMLElement).textContent).toContain('ядер')
    fireEvent.change(combo(), { target: { value: '2' } })
    expect((combo().parentElement as HTMLElement).textContent).toContain('ядра')
    fireEvent.change(combo(), { target: { value: '21' } })
    expect((combo().parentElement as HTMLElement).textContent).toContain('ядро')
  })

  it('exposes an invalid state for the field error', () => {
    render(<Harness invalid />)
    expect(combo().getAttribute('aria-invalid')).toBe('true')
  })

  it('stays closed while disabled', () => {
    render(<Harness disabled />)
    fireEvent.focus(combo())
    expect(document.getElementById('probe-listbox')).toBeNull()
    expect(combo().disabled).toBe(true)
  })
})
