import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render } from '../../test-utils'
import { AdminProductFormPage } from './AdminProductFormPage'
import {
  callsTo, jsonResponse, productDetailFixture, productOptionsFixture, requestBody,
  specTemplateFixture, stubAdminFetch,
} from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

function setup(options: { failFirstUpload?: boolean } = {}) {
  let uploadFailed = false
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/products/filters') {
      return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
    }
    if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
    if (url.pathname === '/api/v1/admin/products' && method === 'POST') {
      const body = requestBody(init) as { name: string }
      return jsonResponse({
        ...productDetailFixture, id: 900, name: body.name, images: [], review_count: 0, average_rating: 0,
      }, 201)
    }
    if (url.pathname === '/api/v1/admin/products/900/images' && method === 'POST') {
      if (options.failFirstUpload && !uploadFailed) {
        uploadFailed = true
        return jsonResponse({ detail: 'Unsupported image format' }, 400)
      }
      return jsonResponse({ id: 901, url: '/uploaded.png', alt_text: null, sort_order: 0, is_cover: true }, 201)
    }
    if (url.pathname === '/api/v1/admin/products/900/images/order' && method === 'PUT') {
      return jsonResponse([{ id: 901, url: '/uploaded.png', alt_text: null, sort_order: 0, is_cover: true }])
    }
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(
    <MemoryRouter initialEntries={['/admin/products/new']}>
      <Routes>
        <Route path="/admin/products/new" element={<AdminProductFormPage />} />
        <Route path="/admin/products/:productId/edit" element={<div>EDIT PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Название товара'), { target: { value: 'Тестовая видеокарта' } })
  fireEvent.change(screen.getByLabelText('Цена, ₽'), { target: { value: '19990' } })
  fireEvent.change(screen.getByLabelText('Количество на складе'), { target: { value: '5' } })
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: '8' } })
  fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: '8' } })
  fireEvent.change(screen.getByLabelText('Производитель'), { target: { value: '1' } })
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin product creation', () => {
  it('uses the shared BackButton and exposes no manual SKU field', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Добавление товара' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Назад/ })).toBeTruthy()
    expect(screen.queryByLabelText(/SKU/)).toBeNull()
    expect(screen.getByText('0 / 10 изображений')).toBeTruthy()
  })

  it('validates required fields before calling the API', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
    expect(await screen.findByText('Введите название товара (минимум 2 символа)')).toBeTruthy()
    expect(screen.getByText('Укажите цену — неотрицательное число')).toBeTruthy()
    expect(screen.getByText('Выберите категорию')).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST')).toBe(false)
  })

  it('sends the contract payload, including the server-driven specifications', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    const memory = await screen.findByLabelText('Объём памяти')
    fireEvent.change(memory, { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })

    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
    expect(await screen.findByText('EDIT PAGE')).toBeTruthy()

    const post = callsTo(fetchMock, '/api/v1/admin/products').find(([, init]) => init.method === 'POST')
    expect(post).toBeTruthy()
    expect(requestBody(post?.[1] ?? {})).toEqual({
      name: 'Тестовая видеокарта',
      product_type_id: 8,
      manufacturer_id: 1,
      price: '19990.00',
      stock_quantity: 5,
      description: '',
      color: null,
      specifications: { memory_size: '12 ГБ', memory_bus: '192 бит' },
      is_active: true,
    })
  })

  it('keeps the created product and retries a failed image upload without creating a duplicate', async () => {
    const fetchMock = setup({ failFirstUpload: true })
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
    expect(await screen.findByText('Товар создан, но не удалось загрузить изображения: 1.')).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').filter(([, init]) => init.method === 'POST')).toHaveLength(1)

    const banner = screen.getByText('Товар создан, но не удалось загрузить изображения: 1.').closest('[role="alert"]')
    if (!banner) throw new Error('upload failure banner missing')
    fireEvent.click(within(banner as HTMLElement).getByRole('button', { name: 'Повторить загрузку' }))
    await waitFor(() => expect(screen.getByText('EDIT PAGE')).toBeTruthy())
    expect(callsTo(fetchMock, '/api/v1/admin/products').filter(([, init]) => init.method === 'POST')).toHaveLength(1)
    expect(callsTo(fetchMock, '/api/v1/admin/products/900/images').filter(([, init]) => init.method === 'POST')).toHaveLength(2)
  })
})

function setupEdit() {
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/products/filters') {
      return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
    }
    if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
    if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(productDetailFixture)
    if (url.pathname === '/api/v1/admin/products/7' && method === 'PATCH') {
      const body = requestBody(init) as { price?: string }
      return jsonResponse({ ...productDetailFixture, ...body, price: body.price ?? productDetailFixture.price })
    }
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(
    <MemoryRouter initialEntries={['/admin/products/7/edit']}>
      <Routes>
        <Route path="/admin/products/:productId/edit" element={<AdminProductFormPage />} />
        <Route path="/admin/products" element={<div>LIST PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

describe('admin product editing', () => {
  it('saves an unchanged grouped price as a numeric API value', async () => {
    const fetchMock = setupEdit()
    expect(await screen.findByRole('heading', { name: 'Редактирование товара' })).toBeTruthy()
    const price = (await screen.findByLabelText(/Цена, ₽/)) as HTMLInputElement
    expect(price.value.replace(/\s/g, ' ')).toBe('64 990')

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy()

    const patch = callsTo(fetchMock, '/api/v1/admin/products/7').find(([, init]) => init.method === 'PATCH')
    expect((requestBody(patch?.[1] ?? {}) as { price: string }).price).toBe('64990.00')
  })
})
