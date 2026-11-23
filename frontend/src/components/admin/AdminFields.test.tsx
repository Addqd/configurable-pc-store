import { describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import { FloatingControl, SelectField, TextField } from './AdminFields'

afterEach(cleanup)

const fieldOf = (container: HTMLElement) => container.querySelector('.pc-field') as HTMLElement

describe('floating-label control', () => {
  it('stays hoverable while its control is enabled', () => {
    const { container } = render(
      <FloatingControl id="probe-name" label="Название">
        <input id="probe-name" />
      </FloatingControl>,
    )
    const field = fieldOf(container)
    // No disabled marker: the shared hover recipe in index.css still applies.
    expect(field.getAttribute('data-disabled')).toBeNull()
    expect(field.classList.contains('pc-field')).toBe(true)
  })

  it('reports a disabled control so the wrapper cannot react to hover', () => {
    const { container } = render(
      <FloatingControl id="probe-locked" label="Название" disabled>
        <input id="probe-locked" disabled />
      </FloatingControl>,
    )
    const field = fieldOf(container)
    // The wrapper is a `div`: it never matches `:disabled` itself, so the explicit
    // marker is what keeps the CSS hover guard honest.
    expect(field.getAttribute('data-disabled')).toBe('true')
    expect(field.hasAttribute('disabled')).toBe(false)
  })

  it('keeps native focus working on an enabled control', () => {
    const { container } = render(
      <FloatingControl id="probe-focus" label="Название">
        <input id="probe-focus" />
      </FloatingControl>,
    )
    const input = container.querySelector('input') as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)
    expect(fieldOf(container).getAttribute('data-disabled')).toBeNull()
  })

  it('keeps an invalid field marked for the shared hover and error guard', () => {
    const { container } = render(
      <TextField id="probe-price" label="Цена" error="Укажите цену" defaultValue="" />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.classList.contains('pc-field')).toBe(true)
    expect(container.textContent).toContain('Укажите цену')
  })

  it('keeps a disabled select marked as a disabled control', () => {
    const { container } = render(
      <SelectField
        id="probe-type"
        label="Тип товара"
        disabled
        value=""
        onChange={() => {}}
        options={[{ value: 'cpu', label: 'Процессор' }]}
      />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.classList.contains('pc-field')).toBe(true)
  })
})
