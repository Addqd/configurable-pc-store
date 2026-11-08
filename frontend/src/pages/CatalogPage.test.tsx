import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react'
import { render } from '../test-utils'
import { mockCatalogFetch } from '../test-api'
import { MemoryRouter, Route, Routes } from 'react-router'
import { CatalogPage } from './CatalogPage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/CatalogProductCard', () => ({ CatalogProductCard: ({ product }: { product: { name: string; category: string; shortSpecs?: string[] } }) => <article>{product.category}: {product.name}<span>{product.shortSpecs?.[0]}</span></article> }))
const setup = (path = '/catalog') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/catalog" element={<CatalogPage />} /></Routes></MemoryRouter>)
beforeEach(() => mockCatalogFetch())
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('server catalog', () => {
  it('fetches a page and fetches the next page after navigation', async () => {
    setup()
    expect(within(await screen.findByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(49)
    fireEvent.click(screen.getByRole('link', { name: 'Страница 2' }))
    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(2))
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true)
  })
  it('sends a selected category to the backend and displays its response', async () => {
    setup('/catalog?category=gpu')
    const cards = within(await screen.findByTestId('catalog-grid')).getAllByRole('article')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every(card => card.textContent?.includes('Видеокарты'))).toBe(true)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('categories=gpu'))).toBe(true)
  })
  it('passes server-provided short specifications to product cards', async () => {
    setup('/catalog?category=cpu')
    const cards = within(await screen.findByTestId('catalog-grid')).getAllByRole('article')
    expect(cards.some(card => /ядер|поток|ГГц/i.test(card.textContent ?? ''))).toBe(true)
  })
  it('opens filters and applies a new category', async () => {
    setup()
    await screen.findByTestId('catalog-grid')
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Процессоры' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }))
    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article').every(card => card.textContent?.includes('Процессоры'))).toBe(true))
  })
  it('shows an error instead of an empty success when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    setup()
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain('Не удалось загрузить')
    expect(screen.queryByTestId('catalog-grid')).toBeNull()
  })
})
