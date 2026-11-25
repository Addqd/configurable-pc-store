import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import { CharacteristicFieldEditor } from './CharacteristicEditor'
import type { CharacteristicDefinitionLike, CharacteristicDraft } from '../../admin/characteristicDrafts'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('ru')
})

const NUMERIC_FIELD: CharacteristicDefinitionLike = {
  code: 'length_mm',
  name: 'Длина',
  data_type: 'number',
  editor: 'numeric',
  unit: 'мм',
  sort_order: 0,
  is_required: true,
  show_in_short: false,
  show_in_details: true,
  options: [
    { option_id: 61, value: '234.1 мм' },
    { option_id: 62, value: '305 мм' },
  ],
  limits: {
    max_selections: 1,
    max_quantity: 1,
    repeatable: false,
    numeric: {
      max_value: '1000',
      decimal_places: 2,
      style: 'suffix',
      affix: 'мм',
      plural_forms: null,
    },
  },
}

const SELECT_FIELD: CharacteristicDefinitionLike = {
  code: 'memory_bus_bits',
  name: 'Шина видеопамяти',
  data_type: 'number',
  editor: 'select',
  unit: 'бит',
  sort_order: 1,
  is_required: false,
  show_in_short: false,
  show_in_details: true,
  options: [
    { option_id: 21, value: '128 бит' },
    { option_id: 22, value: '192 бит' },
  ],
  limits: { max_selections: 1, max_quantity: 1, repeatable: false },
}

const BOOLEAN_FIELD: CharacteristicDefinitionLike = {
  code: 'has_rgb',
  name: 'Подсветка',
  data_type: 'boolean',
  editor: 'boolean',
  unit: null,
  sort_order: 2,
  is_required: false,
  show_in_short: false,
  show_in_details: true,
  options: [
    { option_id: 31, value: 'Да' },
    { option_id: 32, value: 'Нет' },
  ],
  limits: { max_selections: 1, max_quantity: 1, repeatable: false },
}

function Harness({ field }: { field: CharacteristicDefinitionLike }) {
  const [draft, setDraft] = useState<CharacteristicDraft>({
    editor: 'select',
    selected: [],
    quantities: {},
    dimensions: ['', '', ''],
    numericText: '',
    edited: false,
  })
  return (
    <CharacteristicFieldEditor
      field={field}
      draft={{ ...draft, editor: (field.editor as CharacteristicDraft['editor']) ?? 'select' }}
      disabled={false}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
    />
  )
}

describe('CharacteristicFieldEditor', () => {
  it('renders one integrated ComboBox for an editable numeric field', () => {
    render(<Harness field={NUMERIC_FIELD} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Длина' }).tagName).toBe('INPUT')
    // No second search input and no "available values" counter.
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText(/Доступно значений/)).toBeNull()
    expect(document.querySelectorAll('input')).toHaveLength(1)
    // The fixed unit lives inside the same control, and the untouched left column
    // still shows its own unit label.
    expect(screen.getAllByText('мм')).toHaveLength(2)
  })

  it('renders an ordinary dropdown without a search field for a fixed field', () => {
    render(<Harness field={SELECT_FIELD} />)
    const select = screen.getByLabelText('Шина видеопамяти') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(screen.queryByRole('searchbox')).toBeNull()
    // No combobox input exists: the only control is the ordinary select.
    expect(document.querySelectorAll('input[role="combobox"]')).toHaveLength(0)
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Снять выбор',
      '128 бит',
      '192 бит',
    ])
  })

  it('renders an ordinary Yes/No dropdown with an unset state', () => {
    render(<Harness field={BOOLEAN_FIELD} />)
    const select = screen.getByLabelText('Подсветка') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Снять выбор',
      'Да',
      'Нет',
    ])
    fireEvent.change(select, { target: { value: '32' } })
    expect(select.value).toBe('32')
  })

  it('keeps the left column label, its required marker and the unit', () => {
    render(<Harness field={NUMERIC_FIELD} />)
    const label = screen.getByText('Длина')
    expect(label.tagName).toBe('SPAN')
    expect(screen.getByText('*')).toBeTruthy()
  })

  it('localizes the labels and the unit for English', async () => {
    await i18n.changeLanguage('en')
    render(<Harness field={NUMERIC_FIELD} />)
    expect(screen.getByText('Length')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Length' })).toBeTruthy()
    // The dictionary affix is presented with the English unit.
    expect(screen.getAllByText('mm')).toHaveLength(2)
  })

  it('localizes a boolean dropdown for English', async () => {
    await i18n.changeLanguage('en')
    render(<Harness field={BOOLEAN_FIELD} />)
    const select = screen.getByLabelText('Lighting') as HTMLSelectElement
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Clear the selection',
      'Yes',
      'No',
    ])
  })

  it('never turns a used value into a different control when disabled', () => {
    const onChange = vi.fn()
    render(
      <CharacteristicFieldEditor
        field={NUMERIC_FIELD}
        draft={{
          editor: 'numeric',
          selected: [62],
          quantities: {},
          dimensions: ['', '', ''],
          numericText: '305',
          edited: false,
        }}
        disabled
        onChange={onChange}
      />,
    )
    const combo = screen.getByRole('combobox', { name: 'Длина' }) as HTMLInputElement
    expect(combo.disabled).toBe(true)
    expect(combo.value).toBe('305')
    expect(onChange).not.toHaveBeenCalled()
  })
})
