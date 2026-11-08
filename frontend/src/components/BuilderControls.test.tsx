import { getProductsForCategory } from '../test-api'
import { render } from '../test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { mockCatalogFetch } from '../test-api'
import { BuilderActions } from './BuilderActions'
import { BuilderProductSelector } from './BuilderProductSelector'
import { BuilderSidebar } from './BuilderSidebar'
import {
  useBuilderStore, emptyBuilderSelections,
  type BuilderSelections,
} from '../stores/builderStore'

beforeEach(() => {
  useBuilderStore.setState({ selections: emptyBuilderSelections() })
})
afterEach(() => cleanup())

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

describe('Builder controls and validation', () => {
  it('keeps incomplete Create inactive with inline red guidance and no forbidden cursor or title', () => {
    const onCreate = vi.fn()
    render(<BuilderActions onCreate={onCreate} onClear={() => {}} hasSelections={false}
      canCreate={false} validationMessage="Выберите процессор." />)
    const create = screen.getByRole('button', { name: /Создать сборку/i }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    expect(create.className).toContain('disabled:cursor-default')
    expect(create.getAttribute('title')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('Выберите процессор.')
    expect(screen.getByRole('alert').className).toContain('text-red-500')
    fireEvent.click(create)
    expect(onCreate).not.toHaveBeenCalled()
    const save = screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(save.getAttribute('title')).toBeNull()
    expect(save.className).toContain('disabled:cursor-default')
  })

  it('enables Create with a valid completed configuration', () => {
    const onCreate = vi.fn()
    render(<BuilderActions onCreate={onCreate} onClear={() => {}} hasSelections
      canCreate validationMessage="" />)
    const create = screen.getByRole('button', { name: /Создать сборку/i }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(create)
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('keeps the component list fixed-height and scrollable even after an unsuccessful search', async () => {
    mockCatalogFetch()
    render(<BuilderProductSelector category="cpu" onClose={() => {}} />)
    const list = screen.getByTestId('builder-products-scroll')
    expect(list.className).toContain('h-[400px]')
    expect(list.className).toContain('overflow-y-scroll')
    const search = screen.getByPlaceholderText('Поиск по названию и характеристикам') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'nonexistent-product-123!' } })
    await waitFor(() => expect(search.getAttribute('aria-invalid')).toBe('true'))
    expect(screen.getByRole('alert').textContent).toMatch(/ничего не найдено/i)
    expect(screen.getByRole('alert').className).toContain('text-red-500')
    fireEvent.change(search, { target: { value: '' } })
    expect(search.getAttribute('aria-invalid')).toBe('false')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    vi.unstubAllGlobals()
  })

  it('disables right-hand cart action until all parts are selected, with visible validation', () => {
    const onCart = vi.fn()
    const view = render(<BuilderSidebar onAddToCart={onCart} />)
    const cart = screen.getByRole('button', { name: /Добавить сборку в корзину/i }) as HTMLButtonElement
    expect(cart.disabled).toBe(true)
    expect(cart.className).toContain('disabled:cursor-default')
    expect(cart.getAttribute('title')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/осталось 8/i)
    fireEvent.click(cart)
    expect(onCart).not.toHaveBeenCalled()

    act(() => useBuilderStore.setState({ selections: complete() }))
    view.rerender(<BuilderSidebar onAddToCart={onCart} />)
    expect(cart.disabled).toBe(true)
    view.rerender(<BuilderSidebar onAddToCart={onCart} status="compatible" />)
    expect(cart.disabled).toBe(false)
  })
})
