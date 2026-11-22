import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductGallery } from './ProductGallery'
import placeholder from '../assets/placeholder.jpg'
import type { EnrichedProduct, GalleryImage } from '../data/productDetails'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const product = (gallery: GalleryImage[]): EnrichedProduct => ({
  id: 1, name: 'Видеокарта X', category: 'Видеокарты', type: 'Дискретные',
  rating: 0, reviewCount: 0, addedAt: '2026-01-01', manufacturer: 'MSI', specs: [], shortSpecs: [],
  price: 100, image: placeholder, slug: 'gpu-x', article: 'SKU-1', description: 'Описание',
  detailedSpecs: [], reviews: [], gallery,
})

const mainImage = () => screen.getAllByRole('img')[0] as HTMLImageElement

describe('ProductGallery', () => {
  it('shows the existing placeholder when a product has no images', () => {
    render(<ProductGallery product={product([])} />)
    const main = mainImage()
    expect(main.getAttribute('src')).toBe(placeholder)
    expect(main.getAttribute('alt')).toBe('Видеокарта X')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows a single image as the cover with its server alt text', () => {
    render(<ProductGallery product={product([{ url: '/images/cover.jpg', alt: 'MSI RTX 4070' }])} />)
    expect(mainImage().getAttribute('src')).toBe('/images/cover.jpg')
    expect(mainImage().getAttribute('alt')).toBe('MSI RTX 4070')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('uses the first image as the cover and navigates the ordered gallery', () => {
    render(<ProductGallery product={product([
      { url: '/images/1.jpg', alt: 'Вид спереди' },
      { url: '/images/2.jpg', alt: 'Вид сзади' },
      { url: '/images/3.jpg', alt: 'Разъёмы' },
    ])} />)
    expect(mainImage().getAttribute('src')).toBe('/images/1.jpg')
    expect(mainImage().getAttribute('alt')).toBe('Вид спереди')
    const thumbs = screen.getAllByRole('button')
    expect(thumbs).toHaveLength(3)
    expect(thumbs[0].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(thumbs[1])
    expect(mainImage().getAttribute('src')).toBe('/images/2.jpg')
    expect(mainImage().getAttribute('alt')).toBe('Вид сзади')
    expect(thumbs[1].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(thumbs[2])
    expect(mainImage().getAttribute('src')).toBe('/images/3.jpg')
  })

  it('falls back to the placeholder for a broken image url without crashing', () => {
    render(<ProductGallery product={product([{ url: '/images/broken.jpg', alt: 'Битое изображение' }])} />)
    const main = mainImage()
    expect(main.getAttribute('src')).toBe('/images/broken.jpg')
    fireEvent.error(main)
    expect(main.getAttribute('src')).toBe(placeholder)
    expect(main.getAttribute('alt')).toBe('Битое изображение')
  })

  it('covers the main picture with a placeholder until it paints', () => {
    render(<ProductGallery product={product([{ url: '/images/1.jpg', alt: 'Вид' }])} />)
    const main = mainImage()
    const frame = main.parentElement as HTMLElement
    expect(frame.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1)

    fireEvent.load(main)

    expect(frame.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it('removes the placeholder after a failed picture request', () => {
    render(<ProductGallery product={product([{ url: '/images/broken.jpg', alt: 'Битое изображение' }])} />)
    const main = mainImage()
    const frame = main.parentElement as HTMLElement
    expect(frame.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1)

    fireEvent.error(main)

    expect(frame.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it('shows no placeholder for an image that is already complete in the cache', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(800)

    const { container } = render(<ProductGallery product={product([{ url: '/images/cached.jpg', alt: 'Из кеша' }])} />)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })
})
