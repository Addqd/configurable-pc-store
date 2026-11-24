import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductSpecs } from './ProductSpecs'
import type { DetailedSpec, EnrichedProduct } from '../data/productDetails'
import type { ProductCharacteristic } from '../data/product'
import i18n from '../i18n'

afterEach(async () => { cleanup(); await act(async () => { await i18n.changeLanguage('ru') }) })

const product = (
  detailedSpecs: DetailedSpec[],
  characteristics?: ProductCharacteristic[],
): EnrichedProduct => ({
  id: 1, name: 'Видеокарта X', category: 'Видеокарты', type: 'Дискретные', color: 'Чёрный',
  rating: 0, reviewCount: 0, addedAt: '2026-01-01', manufacturer: 'MSI', specs: [], shortSpecs: [],
  price: 100, image: '/placeholder.jpg', slug: 'gpu-x', article: 'SKU-1', description: 'Описание',
  detailedSpecs, reviews: [], gallery: [{ url: '/placeholder.jpg' }], stockQuantity: 1,
  ...(characteristics ? { characteristics } : {}),
})

const characteristic = (
  overrides: Partial<ProductCharacteristic>,
): ProductCharacteristic => ({
  code: 'vram_gb', name: 'Объём видеопамяти', dataType: 'number', unit: 'ГБ', value: 12,
  displayValue: '12 ГБ', showInShort: true, showInDetails: true, ...overrides,
})

describe('ProductSpecs', () => {
  it('renders the imported label/value pairs in order', () => {
    render(<ProductSpecs product={product([
      { label: 'Объём видеопамяти', value: '12 ГБ' },
      { label: 'Разрядность шины', value: '192 бит' },
    ])} />)
    expect(screen.getByRole('heading', { name: 'Характеристики' })).toBeTruthy()
    const labels = screen.getAllByText(/Объём видеопамяти|Разрядность шины/).map(node => node.textContent)
    expect(labels).toEqual(['Объём видеопамяти', 'Разрядность шины'])
    expect(screen.getByText('12 ГБ')).toBeTruthy()
    expect(screen.getByText('192 бит')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Все характеристики' })).toBeNull()
  })

  it('keeps the empty state when there are no display specs', () => {
    render(<ProductSpecs product={product([])} />)
    expect(screen.getByText('Характеристики пока не указаны')).toBeTruthy()
    expect(screen.queryByText('Все характеристики')).toBeNull()
  })

  it('collapses long lists and expands them on request', () => {
    render(<ProductSpecs product={product([
      { label: 'Параметр 1', value: 'Значение 1' },
      { label: 'Параметр 2', value: 'Значение 2' },
      { label: 'Параметр 3', value: 'Значение 3' },
      { label: 'Параметр 4', value: 'Значение 4' },
      { label: 'Параметр 5', value: 'Значение 5' },
    ])} />)
    expect(screen.getByText('Значение 4')).toBeTruthy()
    expect(screen.queryByText('Значение 5')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Все характеристики' }))
    expect(screen.getByText('Значение 5')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Скрыть характеристики' }).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть характеристики' }))
    expect(screen.queryByText('Значение 5')).toBeNull()
  })

  it('renders repeated labels as separate rows', () => {
    render(<ProductSpecs product={product([
      { label: 'Разъём питания', value: '8 pin' },
      { label: 'Разъём питания', value: '6 pin' },
      { label: 'Максимальная температура', value: '95 °C', evidence: { source: 'internal' } } as DetailedSpec,
    ])} />)
    expect(screen.getByText('8 pin')).toBeTruthy()
    expect(screen.getByText('6 pin')).toBeTruthy()
    expect(screen.getByText('95 °C')).toBeTruthy()
    // Internal evidence metadata must never be rendered.
    expect(screen.queryByText(/evidence|internal/)).toBeNull()
  })

  it('localizes the server characteristics for the active language', async () => {
    const rows = [
      characteristic({}),
      characteristic({
        code: 'memory_bus_bits', name: 'Шина видеопамяти', unit: 'бит', value: 192,
        displayValue: '192 бит',
      }),
      characteristic({
        code: 'has_3d_vcache', name: '3D V-Cache', dataType: 'boolean', unit: null,
        value: false, displayValue: 'Нет',
      }),
      // A row excluded by `show_in_details` never appears in this table.
      characteristic({
        code: 'color', name: 'Цвет', dataType: 'string', unit: null, value: 'Чёрный',
        displayValue: 'Чёрный', showInShort: false, showInDetails: false,
      }),
    ]
    render(<ProductSpecs product={product([], rows)} />)
    // Russian mode keeps the stored labels and the server formatting.
    expect(screen.getByText('Объём видеопамяти')).toBeTruthy()
    expect(screen.getByText('12 ГБ')).toBeTruthy()
    expect(screen.getByText('Нет')).toBeTruthy()
    expect(screen.queryByText('Чёрный')).toBeNull()

    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByRole('heading', { name: 'Specifications' })).toBeTruthy()
    expect(screen.getByText('Video memory capacity')).toBeTruthy()
    expect(screen.getByText('12 GB')).toBeTruthy()
    expect(screen.getByText('Memory bus width')).toBeTruthy()
    expect(screen.getByText('192 bit')).toBeTruthy()
    expect(screen.getByText('No')).toBeTruthy()
    // Nothing Russian is left in the table.
    expect(screen.queryByText('Объём видеопамяти')).toBeNull()
    expect(screen.queryByText('Шина видеопамяти')).toBeNull()
  })
})
