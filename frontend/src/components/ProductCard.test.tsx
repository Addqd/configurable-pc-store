import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ProductCard } from './ProductCard'
import { mockProducts } from '../data/mockProducts'

vi.mock('react-icons/fi', () => ({
  FiShoppingCart: () => <div data-testid="fi-cart" />,
}))

describe('ProductCard component', () => {
  const product = mockProducts[0] // Готовые сборки[0]

  beforeEach(() => cleanup())

  it('renders product name', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    expect(screen.getByText(product.name)).toBeTruthy()
  })

  it('renders product specs', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    product.specs.forEach(spec => {
      expect(screen.getByText(spec)).toBeTruthy()
    })
  })

  it('renders product price', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    expect(screen.getByText(/[\d\s]+ ₽/)).toBeTruthy()
  })

  it('renders product image', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    const imgs = screen.getAllByAltText(product.name)
    expect(imgs.length).toBeGreaterThan(0)
  })

  it('renders cart button with aria-label', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    expect(screen.getByLabelText('Добавить в корзину')).toBeTruthy()
  })

  it('links to product page', () => {
    render(
      <MemoryRouter>
        <ProductCard product={product} />
      </MemoryRouter>
    )
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`/products/${product.slug}`)
  })
})
