import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from './ProductCard'
import { mockProducts } from '../data/mockProducts'

vi.mock('react-icons/fi', () => ({
  FiShoppingCart: () => <div data-testid="fi-cart" />,
}))

describe('ProductCard component', () => {
  const product = mockProducts[0] // Готовые сборки[0]

  it('renders product name', () => {
    render(<ProductCard product={product} />)
    expect(screen.getByText(product.name)).toBeTruthy()
  })

  it('renders product specs', () => {
    render(<ProductCard product={product} />)
    product.specs.forEach(spec => {
      expect(screen.getByText(spec)).toBeTruthy()
    })
  })

  it('renders product price', () => {
    render(<ProductCard product={product} />)
    expect(screen.getByText(/[\d\s]+ ₽/)).toBeTruthy()
  })

  it('renders product image', () => {
    render(<ProductCard product={product} />)
    const img = screen.getByAltText(product.name)
    expect(img).toBeTruthy()
  })

  it('renders cart button with aria-label', () => {
    render(<ProductCard product={product} />)
    expect(screen.getByLabelText('Добавить в корзину')).toBeTruthy()
  })

  it('links to product page', () => {
    render(<ProductCard product={product} />)
    const link = screen.getByRole('link', { name: product.name })
    expect(link.getAttribute('href')).toBe(`/products/${product.slug}`)
  })
})
