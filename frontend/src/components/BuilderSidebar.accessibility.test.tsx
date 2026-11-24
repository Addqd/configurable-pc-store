import { getProductsForCategory } from '../test-api'
import { render } from '../test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { BuilderSidebar } from './BuilderSidebar'
import { useBuilderStore, emptyBuilderSelections, type BuilderSelections } from '../stores/builderStore'

const complete = (): BuilderSelections => ({
  cpu: getProductsForCategory('cpu')[1],
  mobo: getProductsForCategory('mobo')[0],
  gpu: getProductsForCategory('gpu')[0],
  ram: getProductsForCategory('ram')[0],
  storage: getProductsForCategory('storage')[0],
  psu: getProductsForCategory('psu')[0],
  case: getProductsForCategory('case')[0],
  cooling: getProductsForCategory('cooling')[0],
})

beforeEach(() => {
  useBuilderStore.setState({ selections: emptyBuilderSelections() })
})
afterEach(() => cleanup())

const cartButton = () => screen.getByRole('button', { name: /Добавить сборку в корзину/i }) as HTMLButtonElement

/** Every referenced description must exist, be unique and say something. */
function resolvableDescriptions() {
  const ids = (cartButton().getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  for (const id of ids) {
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(1)
    const target = document.getElementById(id)
    expect(target).not.toBeNull()
    expect((target?.textContent ?? '').trim()).not.toBe('')
  }
  return ids
}

describe('add-to-cart accessibility description', () => {
  it('does not describe an enabled button of a valid configuration', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="compatible" checked canAdd />)
    expect(cartButton().disabled).toBe(false)
    expect(cartButton().getAttribute('aria-describedby')).toBeNull()
    expect(resolvableDescriptions()).toEqual([])
  })

  it('describes the missing components of an incomplete configuration', () => {
    render(<BuilderSidebar onAddToCart={() => {}} />)
    expect(cartButton().disabled).toBe(true)
    expect(resolvableDescriptions()).toEqual(['builder-cart-validation'])
    expect(screen.getByRole('alert').textContent).toMatch(/осталось 8/i)
  })

  it('does not reference a description while the compatibility check is pending', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="compatible" loading />)
    expect(cartButton().disabled).toBe(true)
    expect(cartButton().getAttribute('aria-describedby')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(resolvableDescriptions()).toEqual([])
  })

  it('does not reference a description for an unchecked but complete configuration', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="unknown" />)
    expect(cartButton().disabled).toBe(true)
    expect(cartButton().getAttribute('aria-describedby')).toBeNull()
    expect(resolvableDescriptions()).toEqual([])
  })

  it('describes an incompatible configuration', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="incompatible" checked messages={['Мощность блока питания недостаточна']} />)
    expect(cartButton().disabled).toBe(true)
    expect(resolvableDescriptions()).toEqual(['builder-cart-validation'])
    expect(document.getElementById('builder-cart-validation')?.textContent).toMatch(/устран/i)
  })

  it('explains a complete configuration whose check found no supported evidence', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="unknown" checked />)
    expect(cartButton().disabled).toBe(true)
    expect(cartButton().getAttribute('aria-describedby')).toBeNull()
    expect(resolvableDescriptions()).toEqual([])
    expect(screen.getByRole('status').textContent).toMatch(/Создать сборку/i)
  })

  it('no longer requires saving the build before adding it to the cart', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="compatible" checked canAdd />)
    // A verified configuration is cart-eligible even when nothing was saved.
    expect(cartButton().disabled).toBe(false)
    expect(document.getElementById('builder-cart-validation')).toBeNull()
  })

  it('does not reference a description when a failed check leaves nothing to explain', () => {
    act(() => useBuilderStore.setState({ selections: complete() }))
    render(<BuilderSidebar onAddToCart={() => {}} status="unknown" error />)
    expect(cartButton().disabled).toBe(true)
    expect(cartButton().getAttribute('aria-describedby')).toBeNull()
    expect(resolvableDescriptions()).toEqual([])
  })

  it('describes missing components even when the check failed', () => {
    render(<BuilderSidebar onAddToCart={() => {}} status="unknown" error />)
    expect(cartButton().disabled).toBe(true)
    expect(resolvableDescriptions()).toEqual(['builder-cart-validation'])
  })
})
