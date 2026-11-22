import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductCartItem } from './ProductCartItem'
import type { RegularCartItem } from '../stores/cartStore'

const item: RegularCartItem = {
  id: 8,
  name: 'MSI GeForce RTX 4070 SUPER Gaming X Slim 12G',
  price: 64990,
  quantity: 1,
  image: '/card.png',
  category: 'gpu',
  specs: ['12 ГБ GDDR6X', '192 бит', 'DLSS 3'],
}

const specsParagraph = (container: HTMLElement) =>
  container.querySelector('h2')?.nextElementSibling as HTMLParagraphElement

afterEach(() => cleanup())

describe('cart product specifications', () => {
  it('separates specifications with a filled bullet and nothing else', () => {
    const { container } = render(
      <ProductCartItem item={item} onQuantityChange={vi.fn()} onRemove={vi.fn()} />,
    )
    const paragraph = specsParagraph(container)
    expect(paragraph.textContent).toBe('12 ГБ GDDR6X•192 бит•DLSS 3')
    const bullets = [...paragraph.querySelectorAll('span')]
      .map((node) => node.textContent)
      .filter((text) => text === '•')
    // Exactly one bullet between the three specifications: none leading or trailing.
    expect(bullets).toHaveLength(2)
    expect(paragraph.textContent?.startsWith('•')).toBe(false)
    expect(paragraph.textContent?.endsWith('•')).toBe(false)
  })

  it('keeps every specification intact instead of splitting its contents', () => {
    const { container } = render(
      <ProductCartItem item={item} onQuantityChange={vi.fn()} onRemove={vi.fn()} />,
    )
    const pieces = [...specsParagraph(container).querySelectorAll('span')].map((node) => node.textContent)
    expect(pieces).toEqual(['12 ГБ GDDR6X', '•', '192 бит', '•', 'DLSS 3'])
  })

  it('keeps the approved text styles and wrapping of the specification line', () => {
    const { container } = render(
      <ProductCartItem item={item} onQuantityChange={vi.fn()} onRemove={vi.fn()} />,
    )
    const paragraph = specsParagraph(container)
    expect(paragraph.className).toBe('mt-1 text-sm leading-relaxed text-text-muted')
    // Inline flow: no per-specification block element forces its own line.
    expect(paragraph.querySelector('div, ul, li, br')).toBeNull()
  })

  it('renders no separator for a single specification', () => {
    const { container } = render(
      <ProductCartItem
        item={{ ...item, specs: ['12 ГБ GDDR6X'] }}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(specsParagraph(container).textContent).toBe('12 ГБ GDDR6X')
  })

  it('renders an empty line when the product has no specifications', () => {
    const { container } = render(
      <ProductCartItem item={{ ...item, specs: [] }} onQuantityChange={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(specsParagraph(container).textContent).toBe('')
  })

  it('keeps the quantity controls and the running line total', () => {
    const onQuantityChange = vi.fn()
    render(
      <ProductCartItem
        item={{ ...item, quantity: 2 }}
        onQuantityChange={onQuantityChange}
        onRemove={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Увеличить количество/i }))
    expect(onQuantityChange).toHaveBeenCalledWith(8, 3)
    // `Intl` groups digits with non-breaking spaces; compare on a readable form.
    const total = document.querySelector('strong')?.textContent?.replace(/\u00a0|\u202f/g, ' ')
    expect(total).toBe('129 980 ₽')
  })
})
