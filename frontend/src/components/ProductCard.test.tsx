import { render } from '../test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ProductCard } from './ProductCard'
import { mockProducts } from '../data/mockProducts'

vi.mock('react-icons/fi', () => ({ FiShoppingCart: () => <div data-testid="fi-cart" /> }))

describe('ProductCard', () => {
  const product = mockProducts[0]

  beforeEach(() => cleanup())

  function renderCard() {
    return render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
  }

  it('renders title, price and image', () => {
    renderCard()
    expect(screen.getByText(product.name)).toBeTruthy()
    expect(screen.getByText(/[\d\s]+ ₽/)).toBeTruthy()
    expect(screen.getByAltText(product.name)).toBeTruthy()
  })

  it('renders compact two-line specs without hiding the four source fields from Product Details', () => {
    renderCard()
    const specs = product.shortSpecs ?? product.specs
    expect(screen.getByText(specs.slice(0, 2).join(' • '))).toBeTruthy()
    expect(screen.getByText(specs.slice(2, 4).join(' • '))).toBeTruthy()
    expect(product.specs).toHaveLength(4)
  })

  it('uses fade-overflow wrappers instead of growing card height with long content', () => {
    const { container } = renderCard()
    expect(container.querySelectorAll('.bg-gradient-to-l').length).toBeGreaterThanOrEqual(3)
  })

  it('has cart action and a link to the details route', () => {
    renderCard()
    expect(screen.getByRole('button', { name: 'Добавить в корзину' })).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/products/${product.slug}`)
  })
})
