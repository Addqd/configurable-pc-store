import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from '../test-utils'
import { ProductCartItem } from './ProductCartItem'
import type { RegularCartItem } from '../stores/cartStore'
import type { ProductCharacteristic } from '../data/product'
import i18n from '../i18n'

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

afterEach(async () => { cleanup(); await act(async () => { await i18n.changeLanguage('ru') }) })

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

const structured: ProductCharacteristic[] = [
  {
    code: 'vram_gb', name: 'Объём видеопамяти', dataType: 'number', unit: 'ГБ',
    value: 12, displayValue: '12 ГБ', showInShort: true, showInDetails: true,
  },
  {
    code: 'memory_bus_bits', name: 'Шина видеопамяти', dataType: 'number', unit: 'бит',
    value: 192, displayValue: '192 бит', showInShort: true, showInDetails: true,
  },
]

describe('cart product specification localization', () => {
  it('renders the structured short characteristics in Russian', () => {
    const { container } = render(
      <ProductCartItem
        item={{ ...item, characteristics: structured }}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(specsParagraph(container).textContent).toBe('12 ГБ•192 бит')
  })

  it('renders them in English without changing the stored values', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    const { container } = render(
      <ProductCartItem
        item={{ ...item, characteristics: structured }}
        onQuantityChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(specsParagraph(container).textContent).toBe('12 GB•192 bit')
    // The row itself still carries the untouched native value.
    expect(structured[0].value).toBe(12)
    expect(structured[0].displayValue).toBe('12 ГБ')
  })

  it('falls back to the server lines when there are no structured rows', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    const { container } = render(
      <ProductCartItem item={item} onQuantityChange={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(specsParagraph(container).textContent).toBe('12 ГБ GDDR6X•192 бит•DLSS 3')
  })
})
