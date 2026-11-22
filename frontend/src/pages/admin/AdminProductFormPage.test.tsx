import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { act } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { createTestQueryClient, render } from '../../test-utils'
import i18n from '../../i18n'
import { AdminProductFormPage } from './AdminProductFormPage'
import {
  callsTo, jsonResponse, productDetailFixture, productOptionsFixture, requestBody,
  specTemplateFixture, stubAdminFetch,
} from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

function setup(options: { failFirstUpload?: boolean; failFirstOrder?: boolean } = {}) {
  let uploadFailed = false
  let orderFailed = false
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
      if (options.failFirstOrder && !orderFailed) {
        orderFailed = true
        return jsonResponse({ detail: 'Ordering failed' }, 500)
      }
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

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await act(async () => { await i18n.changeLanguage('ru') })
})

describe('admin product creation', () => {
  it('uses the shared BackButton and exposes no manual SKU field', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Добавление товара' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
    expect(screen.queryByLabelText(/SKU/)).toBeNull()
    expect(screen.getByText('0 / 10 изображений')).toBeTruthy()
  })

  it('keeps a single back control while the form skeleton is rendered', () => {
    setup()
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
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

  it('applies the existing type and size validation to files dropped from the OS', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    const zone = document.querySelector('[data-gallery-dropzone]') as HTMLElement

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })], types: ['Files'] },
    })
    expect(await screen.findByText('Можно загрузить только JPG, PNG или WebP')).toBeTruthy()
    expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(0)

    const bigFile = new File([new Uint8Array(1)], 'huge.png', { type: 'image/png' })
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })
    fireEvent.drop(zone, { dataTransfer: { files: [bigFile], types: ['Files'] } })
    expect(await screen.findByText('Изображение должно быть меньше 5 МБ')).toBeTruthy()
    expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(0)

    fireEvent.drop(zone, {
      dataTransfer: { files: [new File([new Uint8Array([1])], 'ok.png', { type: 'image/png' })], types: ['Files'] },
    })
    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(1))
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

  it('keeps an ordering failure recoverable and retries the order without re-uploading the accepted image', async () => {
    const fetchMock = setup({ failFirstOrder: true })
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
    expect(await screen.findByText('Товар создан, но порядок изображений не сохранён.')).toBeTruthy()
    // The failed ordering must not be reported as a completed creation.
    expect(screen.queryByText('EDIT PAGE')).toBeNull()
    expect(callsTo(fetchMock, '/api/v1/admin/products/900/images').filter(([, init]) => init.method === 'POST')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение порядка' }))
    await waitFor(() => expect(screen.getByText('EDIT PAGE')).toBeTruthy())

    const uploads = callsTo(fetchMock, '/api/v1/admin/products/900/images').filter(([, init]) => init.method === 'POST')
    expect(uploads).toHaveLength(1)
    const orders = callsTo(fetchMock, '/api/v1/admin/products/900/images/order').filter(([, init]) => init.method === 'PUT')
    expect(orders.length).toBeGreaterThanOrEqual(2)
    expect((requestBody(orders.at(-1)?.[1] ?? {}) as { image_ids: number[] }).image_ids).toEqual([901])
  })
})

function setupEdit(price = '64990.00', extra?: (url: URL, init: RequestInit) => Response | undefined) {
  const detail = { ...productDetailFixture, price }
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/products/filters') {
      return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
    }
    if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
    if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(detail)
    if (url.pathname === '/api/v1/admin/products/7' && method === 'PATCH') {
      const body = requestBody(init) as { price?: string }
      return jsonResponse({ ...detail, ...body, price: body.price ?? detail.price })
    }
    return extra?.(url, init)
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
  it('renders exactly one shared BackButton', async () => {
    setupEdit()
    expect(await screen.findByRole('heading', { name: 'Редактирование товара' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
  })

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

  it('preserves a fractional price when the language switches from RU to EN', async () => {
    const fetchMock = setupEdit('129990.50')
    expect(await screen.findByRole('heading', { name: 'Редактирование товара' })).toBeTruthy()
    const price = document.getElementById('product-price') as HTMLInputElement
    expect(price.value.replace(/\u00a0|\u202f/g, ' ')).toBe('129 990,5')

    await act(async () => { await i18n.changeLanguage('en') })
    expect(price.value.replace(/\u00a0|\u202f/g, ' ')).toBe('129,990.5')

    await submitForm()
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/admin/products/7').some(([, init]) => init.method === 'PATCH')).toBe(true))
    const patch = callsTo(fetchMock, '/api/v1/admin/products/7').find(([, init]) => init.method === 'PATCH')
    expect((requestBody(patch?.[1] ?? {}) as { price: string }).price).toBe('129990.50')
  })

  it('preserves a fractional price when the language switches from EN to RU', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    const fetchMock = setupEdit('129990.50')
    expect(await screen.findByRole('heading', { name: 'Edit product' })).toBeTruthy()
    const price = document.getElementById('product-price') as HTMLInputElement
    expect(price.value.replace(/\u00a0|\u202f/g, ' ')).toBe('129,990.5')

    await act(async () => { await i18n.changeLanguage('ru') })
    expect(price.value.replace(/\u00a0|\u202f/g, ' ')).toBe('129 990,5')

    await submitForm()
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/admin/products/7').some(([, init]) => init.method === 'PATCH')).toBe(true))
    const patch = callsTo(fetchMock, '/api/v1/admin/products/7').find(([, init]) => init.method === 'PATCH')
    expect((requestBody(patch?.[1] ?? {}) as { price: string }).price).toBe('129990.50')
  })

  it('never resurrects a deleted image when a failed reorder rolls back', async () => {
    const detail = {
      ...productDetailFixture,
      images: [
        { id: 71, url: '/photo-1.png', alt_text: null, sort_order: 0, is_cover: true },
        { id: 72, url: '/photo-2.png', alt_text: null, sort_order: 1, is_cover: false },
        { id: 73, url: '/photo-3.png', alt_text: null, sort_order: 2, is_cover: false },
      ],
    }
    const fetchMock = stubAdminFetch({
      handler: (url, init) => {
        const method = init.method ?? 'GET'
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
        if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(detail)
        if (url.pathname === '/api/v1/admin/products/7/images/73' && method === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') {
          return jsonResponse({ detail: 'Ordering failed' }, 500)
        }
        return undefined
      },
    })
    render(
      <MemoryRouter initialEntries={['/admin/products/7/edit']}>
        <Routes>
          <Route path="/admin/products/:productId/edit" element={<AdminProductFormPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(3))

    // Delete the third image for real (the server confirms the deletion).
    const thirdTile = document.querySelector('[data-gallery-index="2"]') as HTMLElement
    fireEvent.click(within(thirdTile).getByRole('button', { name: /Удалить изображение/ }))
    const confirmation = screen.getByRole('dialog')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Удалить изображение' }))
    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(2))
    expect(callsTo(fetchMock, '/api/v1/admin/products/7/images/73').some(([, init]) => init.method === 'DELETE')).toBe(true)

    // A reorder the server rejects must roll back to the server order only.
    const tiles = document.querySelectorAll('[data-gallery-index]')
    fireEvent.dragStart(tiles[0] as HTMLElement, { dataTransfer: { files: [], types: [] } })
    fireEvent.drop(tiles[1] as HTMLElement, { dataTransfer: { files: [], types: [] } })

    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(2))
    const srcs = Array.from(document.querySelectorAll('[data-gallery-index] img')).map((img) => img.getAttribute('src'))
    expect(srcs).toEqual(['/photo-1.png', '/photo-2.png'])
  })

  it('does not start an image removal while a reorder request is in flight', async () => {
    const detail = {
      ...productDetailFixture,
      images: [
        { id: 71, url: '/photo-1.png', alt_text: null, sort_order: 0, is_cover: true },
        { id: 72, url: '/photo-2.png', alt_text: null, sort_order: 1, is_cover: false },
      ],
    }
    let finishOrder: ((response: Response) => void) | undefined
    const orderResponse = new Promise<Response>((resolve) => { finishOrder = resolve })
    stubAdminFetch({
      handler: (url, init) => {
        const method = init.method ?? 'GET'
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
        if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(detail)
        if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return orderResponse
        return undefined
      },
    })
    render(
      <MemoryRouter initialEntries={['/admin/products/7/edit']}>
        <Routes>
          <Route path="/admin/products/:productId/edit" element={<AdminProductFormPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(2))

    const tiles = document.querySelectorAll('[data-gallery-index]')
    fireEvent.dragStart(tiles[0] as HTMLElement, { dataTransfer: { files: [], types: [] } })
    fireEvent.drop(tiles[1] as HTMLElement, { dataTransfer: { files: [], types: [] } })

    // While the order request is pending the gallery cannot start a delete.
    await waitFor(() => {
      const remove = document.querySelector('[data-gallery-index="0"] button[aria-label^="Удалить изображение"]') as HTMLButtonElement
      expect(remove.disabled).toBe(true)
    })
    fireEvent.click(document.querySelector('[data-gallery-index="0"] button[aria-label^="Удалить изображение"]') as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()

    finishOrder?.(jsonResponse({ detail: 'Ordering failed' }, 500))
    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(2))
  })
})

const submittedPrice = (fetchMock: ReturnType<typeof vi.fn>) => {
  const patch = callsTo(fetchMock, '/api/v1/admin/products/7').find(([, init]) => init.method === 'PATCH')
  return patch ? (requestBody(patch[1]) as { price: string }).price : null
}

const submitForm = async () => {
  // The submit button stays disabled until the specification template resolves.
  await screen.findByLabelText('Объём памяти')
  fireEvent.click(document.querySelector('form button[type="submit"]') as HTMLButtonElement)
}

describe('admin product price parsing', () => {
  it('reads a RU fractional price as the same amount', async () => {
    const fetchMock = setupEdit()
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const price = document.getElementById('product-price') as HTMLInputElement
    fireEvent.change(price, { target: { value: '0,50' } })
    expect(price.value).toBe('0,50')

    await submitForm()
    await waitFor(() => expect(submittedPrice(fetchMock)).toBe('0.50'))
  })

  it('reads a grouped RU price as 1234.56', async () => {
    const fetchMock = setupEdit()
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const price = document.getElementById('product-price') as HTMLInputElement
    fireEvent.change(price, { target: { value: '1 234,56' } })

    await submitForm()
    await waitFor(() => expect(submittedPrice(fetchMock)).toBe('1234.56'))
  })

  it('reads EN grouped and fractional prices without changing the amount', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    const grouped = setupEdit()
    await screen.findByRole('heading', { name: 'Edit product' })
    const price = document.getElementById('product-price') as HTMLInputElement
    fireEvent.change(price, { target: { value: '1,234.56' } })
    await submitForm()
    await waitFor(() => expect(submittedPrice(grouped)).toBe('1234.56'))
  })

  it('reads an EN 0.50 price as fifty kopecks', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    const fetchMock = setupEdit()
    await screen.findByRole('heading', { name: 'Edit product' })
    const price = document.getElementById('product-price') as HTMLInputElement
    fireEvent.change(price, { target: { value: '0.50' } })
    await submitForm()
    await waitFor(() => expect(submittedPrice(fetchMock)).toBe('0.50'))
  })

  it('never reinterprets an EN comma decimal as 50.00', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    const fetchMock = setupEdit()
    await screen.findByRole('heading', { name: 'Edit product' })
    const price = document.getElementById('product-price') as HTMLInputElement
    fireEvent.change(price, { target: { value: '0,50' } })

    await submitForm()
    expect(await screen.findByText(/cents are separated with a period/)).toBeTruthy()
    expect(submittedPrice(fetchMock)).toBeNull()
    // The ambiguous input is kept for the user to correct, not rewritten.
    expect(price.value).toBe('0,50')
  })

  it('keeps the canonical amount across a RU to EN language switch', async () => {
    const fetchMock = setupEdit()
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const price = document.getElementById('product-price') as HTMLInputElement
    fireEvent.change(price, { target: { value: '1 234,56' } })

    await act(async () => { await i18n.changeLanguage('en') })
    expect(price.value.replace(/\u00a0|\u202f/g, ' ')).toBe('1,234.56')

    await submitForm()
    await waitFor(() => expect(submittedPrice(fetchMock)).toBe('1234.56'))
  })

  it('blocks an ambiguous price instead of sending zero when creating', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    // The submit button waits for the specification template of the chosen type.
    await screen.findByLabelText('Объём памяти')
    fireEvent.change(screen.getByLabelText('Цена, ₽'), { target: { value: '12,34,56' } })

    await submitForm()
    expect(await screen.findByText(/копейки отделяются запятой/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST')).toBe(false)
  })

  it('uses a locale-appropriate price placeholder', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    const price = document.getElementById('product-price') as HTMLInputElement
    expect(price.placeholder).toBe('0,00')

    await act(async () => { await i18n.changeLanguage('en') })
    expect(price.placeholder).toBe('0.00')
  })
})

const editHeading = (locale: string) => (locale === 'en' ? 'Edit product' : 'Редактирование товара')

async function submitEditedPrice(locale: 'ru' | 'en', input: string) {
  if (locale === 'en') await act(async () => { await i18n.changeLanguage('en') })
  const fetchMock = setupEdit()
  await screen.findByRole('heading', { name: editHeading(locale) })
  const price = document.getElementById('product-price') as HTMLInputElement
  fireEvent.change(price, { target: { value: input } })
  await submitForm()
  return { fetchMock, price }
}

describe('admin product price precision', () => {
  const accepted: Array<['ru' | 'en', string, string]> = [
    ['ru', '0,01', '0.01'],
    ['en', '0.01', '0.01'],
  ]
  for (const [locale, input, expected] of accepted) {
    it(`sends ${locale.toUpperCase()} ${input} as ${expected}`, async () => {
      const { fetchMock } = await submitEditedPrice(locale, input)
      await waitFor(() => expect(submittedPrice(fetchMock)).toBe(expected))
    })
  }

  const rejected: Array<['ru' | 'en', string, RegExp]> = [
    ['ru', '0,001', /не более двух знаков/],
    ['ru', '12,345', /не более двух знаков/],
    ['en', '0.001', /at most two decimal places/],
    ['en', '12.345', /at most two decimal places/],
  ]
  for (const [locale, input, message] of rejected) {
    it(`rejects ${locale.toUpperCase()} ${input} without sending it`, async () => {
      const { fetchMock, price } = await submitEditedPrice(locale, input)
      expect(await screen.findByText(message)).toBeTruthy()
      // Excess precision is never rounded into a different amount.
      expect(submittedPrice(fetchMock)).toBeNull()
      // The typed text stays editable exactly as entered.
      expect(price.value).toBe(input)
      expect(price.disabled).toBe(false)
    })
  }

  it('rejects a mixed RU separator instead of reading it as another amount', async () => {
    const { fetchMock, price } = await submitEditedPrice('ru', '1.234,56')
    expect(await screen.findByText(/Проверьте формат цены/)).toBeTruthy()
    expect(submittedPrice(fetchMock)).toBeNull()
    expect(price.value).toBe('1.234,56')
  })

  it('keeps an explicit zero price valid', async () => {
    const { fetchMock } = await submitEditedPrice('ru', '0,00')
    await waitFor(() => expect(submittedPrice(fetchMock)).toBe('0.00'))
  })

  it('blocks excess precision on creation and accepts the corrected amount', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })
    const price = screen.getByLabelText('Цена, ₽') as HTMLInputElement

    fireEvent.change(price, { target: { value: '0,001' } })
    await submitForm()
    expect(await screen.findByText(/не более двух знаков/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST')).toBe(false)
    expect(price.value).toBe('0,001')

    fireEvent.change(price, { target: { value: '0,01' } })
    await submitForm()
    await waitFor(() => expect(screen.getByText('EDIT PAGE')).toBeTruthy())
    const post = callsTo(fetchMock, '/api/v1/admin/products').find(([, init]) => init.method === 'POST')
    expect((requestBody(post?.[1] ?? {}) as { price: string }).price).toBe('0.01')
  })
})

describe('admin product order recovery while editing', () => {
  it('offers an order-only retry for an existing product without re-uploading', async () => {
    let orderAttempts = 0
    const fetchMock = setupEdit('64990.00', (url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        return jsonResponse({ id: 73, url: '/uploaded-3.png', alt_text: null, sort_order: 2, is_cover: false }, 201)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') {
        orderAttempts += 1
        if (orderAttempts === 1) return jsonResponse({ detail: 'Ordering failed' }, 500)
        return jsonResponse([])
      }
      return undefined
    })
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(document.querySelectorAll('[data-gallery-index]')).toHaveLength(2))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'photo-3.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    // The upload is accepted, the ordering is rejected: the admin gets a retry.
    expect(await screen.findByText('Порядок изображений не сохранён.')).toBeTruthy()
    const uploads = () => callsTo(fetchMock, '/api/v1/admin/products/7/images').filter(([, init]) => init.method === 'POST')
    const orders = () => callsTo(fetchMock, '/api/v1/admin/products/7/images/order').filter(([, init]) => init.method === 'PUT')
    expect(uploads()).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение порядка' }))
    await waitFor(() => expect(screen.queryByText('Порядок изображений не сохранён.')).toBeNull())

    // Only the failed ordering is retried; the accepted image is never uploaded twice.
    expect(uploads()).toHaveLength(1)
    expect(orders().length).toBeGreaterThanOrEqual(2)
    expect((requestBody(orders().at(-1)?.[1] ?? {}) as { image_ids: number[] }).image_ids).toEqual([71, 72, 73])
  })
})

describe('admin product form panel semantics', () => {
  it('uses no tabpanel semantics in creation mode', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    expect(document.querySelector('[role="tabpanel"]')).toBeNull()
    expect(document.querySelector('[role="tablist"]')).toBeNull()
    expect(document.querySelector('[role="tab"]')).toBeNull()
    // Every ARIA relationship still points at an element that exists.
    for (const element of Array.from(document.querySelectorAll('[aria-labelledby]'))) {
      const id = element.getAttribute('aria-labelledby') as string
      expect(document.getElementById(id), id).toBeTruthy()
    }
  })

  it('keeps the tab and tabpanel pair when editing', async () => {
    setupEdit()
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const productTab = screen.getByRole('tab', { name: 'Товар' })
    const panel = screen.getByRole('tabpanel')

    expect(productTab.getAttribute('aria-selected')).toBe('true')
    expect(productTab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(productTab.id)
    expect(screen.getByRole('tab', { name: 'Отзывы' }).getAttribute('aria-controls')).toBeTruthy()
  })
})

/** A response promise that stays pending until the test resolves it. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const galleryTiles = () => Array.from(document.querySelectorAll('[data-gallery-index]'))
const tileSources = () => galleryTiles().map((tile) => tile.querySelector('img')?.getAttribute('src'))
const tileFile = (name = 'photo-3.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })

const addGalleryFiles = (files: File[]) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

const requestsTo = (fetchMock: ReturnType<typeof vi.fn>, pathname: string, method: string) =>
  callsTo(fetchMock, pathname).filter(([, init]) => init.method === method)

const imageFixture = (id: number, index: number) => ({
  id, url: `/photo-${index + 1}.png`, alt_text: null, sort_order: index, is_cover: index === 0,
})

const uploadedFixture = (id: number) => ({
  id, url: `/uploaded-${id}.png`, alt_text: null, sort_order: id, is_cover: false,
})

/** Product edit screen with a known gallery and a per-test request handler. */
function setupEditGallery(  extra: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined,
  options: { imageIds?: number[]; client?: QueryClient } = {},
) {
  const detail = { ...productDetailFixture, images: (options.imageIds ?? [71, 72]).map(imageFixture) }
  const fetchMock = stubAdminFetch({
    handler: (url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
      if (url.pathname === '/api/v1/products/filters') {
        return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
      }
      if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
      if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(detail)
      return extra(url, init)
    },
  })
  render(
    <MemoryRouter initialEntries={['/admin/products/7/edit']}>
      <Routes>
        <Route path="/admin/products/:productId/edit" element={<AdminProductFormPage />} />
      </Routes>
    </MemoryRouter>,
    options.client ? { client: options.client } : undefined,
  )
  return fetchMock
}

const creationHandler = (options: { failFirstUpload?: boolean; failOrder?: boolean }) => {
  let uploadAttempts = 0
  let orderAttempts = 0
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/products/filters') {
      return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
    }
    if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
    if (url.pathname === '/api/v1/admin/products' && method === 'POST') {
      return jsonResponse({ ...productDetailFixture, id: 900, images: [], review_count: 0, average_rating: 0 }, 201)
    }
    if (url.pathname === '/api/v1/admin/products/900/images' && method === 'POST') {
      uploadAttempts += 1
      if (options.failFirstUpload && uploadAttempts === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
      return jsonResponse(uploadedFixture(901), 201)
    }
    if (url.pathname === '/api/v1/admin/products/900/images/order' && method === 'PUT') {
      orderAttempts += 1
      if (options.failOrder) return jsonResponse({ detail: 'Ordering failed' }, 500)
      return jsonResponse([uploadedFixture(901)])
    }
    return undefined
  }
  return { handler, attempts: () => ({ uploads: uploadAttempts, orders: orderAttempts }) }
}

/** Creates a product with one gallery file and returns its upload-failure banner. */
const submitCreationWithFile = async () => {
  await screen.findByRole('heading', { name: 'Добавление товара' })
  fillRequiredFields()
  fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
  fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })
  addGalleryFiles([tileFile('photo.png')])
  fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
  const banner = (await screen.findByText('Товар создан, но не удалось загрузить изображения: 1.')).closest('[role="alert"]')
  if (!banner) throw new Error('upload failure banner missing')
  return banner as HTMLElement
}

describe('admin product upload retry cache refresh', () => {
  /** Unobserved cache entries per invalidation family, seeded by each test. */
  const catalogKeys = () => ({
    product: [
      ['/api/v1/admin/products', { page: 2 }],
      ['/api/v1/admin/products/900'],
      ['/api/v1/products', { page: 2 }],
      ['/api/v1/products/gpu-rtx-5070'],
      ['/api/v1/products/7/images'],
      ['/api/v1/admin/stats/overview', { date_from: '2026-06-01' }],
      ['/api/v1/admin/stats/products', { page: 1 }],
      // The backend derives the available colours, manufacturers and product
      // types from the product records, so a product change also refreshes them.
      ['/api/v1/products/filters', {}],
    ] as const,
    // Private user data is unrelated to a product image change.
    private: [
      ['/api/v1/admin/users', { page: 1 }],
      ['/api/v1/auth/me'],
      ['/api/v1/cart'],
    ] as const,
  })

  const seedCatalog = (client: QueryClient, keys: ReturnType<typeof catalogKeys>) => {
    for (const key of [...keys.product, ...keys.private]) client.setQueryData(key, { seeded: true })
  }

  const isInvalidated = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false

  /** Records the endpoint path of every query the client actually invalidated. */
  const recordInvalidatedPaths = (client: QueryClient) => {
    const paths: string[] = []
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'invalidate') {
        paths.push(String(event.query.queryKey[0]))
      }
    })
    return { paths, unsubscribe }
  }

  const renderCreation = (fetchMock: ReturnType<typeof vi.fn>, client: QueryClient) => {
    void fetchMock
    render(
      <MemoryRouter initialEntries={['/admin/products/new']}>
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:productId/edit" element={<div>EDIT PAGE</div>} />
        </Routes>
      </MemoryRouter>,
      { client },
    )
  }

  it('invalidates the catalog because of a successful creation-mode upload retry', async () => {
    const creation = creationHandler({ failFirstUpload: true })
    const fetchMock = stubAdminFetch({ handler: creation.handler })
    const client = createTestQueryClient()
    const keys = catalogKeys()
    seedCatalog(client, keys)
    const { paths, unsubscribe } = recordInvalidatedPaths(client)
    renderCreation(fetchMock, client)

    const banner = await submitCreationWithFile()
    // Creation itself already refreshed the product queries, so both the seeded
    // state and the recorder are reset: only the retry may satisfy the assertion.
    seedCatalog(client, keys)
    paths.length = 0
    expect(isInvalidated(client, keys.product[0])).toBe(false)

    fireEvent.click(within(banner).getByRole('button', { name: 'Повторить загрузку' }))
    await waitFor(() => expect(screen.getByText('EDIT PAGE')).toBeTruthy())
    unsubscribe()

    expect(creation.attempts()).toEqual({ uploads: 2, orders: 1 })
    for (const key of keys.product) expect(isInvalidated(client, key), String(key)).toBe(true)
    for (const key of keys.private) expect(isInvalidated(client, key), String(key)).toBe(false)
    // Exactly the seeded product families were refreshed, nothing else.
    expect([...new Set(paths)].sort()).toEqual([
      '/api/v1/admin/products',
      '/api/v1/admin/products/900',
      '/api/v1/admin/stats/overview',
      '/api/v1/admin/stats/products',
      '/api/v1/products',
      '/api/v1/products/7/images',
      '/api/v1/products/filters',
      '/api/v1/products/gpu-rtx-5070',
    ].sort())
  })

  it('invalidates the catalog after a successful individual upload retry', async () => {
    let uploadAttempts = 0
    const client = createTestQueryClient()
    const keys = catalogKeys()
    seedCatalog(client, keys)
    const { paths, unsubscribe } = recordInvalidatedPaths(client)
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        uploadAttempts += 1
        if (uploadAttempts === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
        return jsonResponse(uploadedFixture(73), 201)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return jsonResponse([])
      return undefined
    }, { client })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку' })
    // A rejected upload refreshes nothing on its own.
    expect(paths).toHaveLength(0)
    expect(isInvalidated(client, keys.product[0])).toBe(false)

    fireEvent.click(retry)
    await waitFor(() => expect(uploadAttempts).toBe(2))
    await waitFor(() => expect(isInvalidated(client, keys.product[0])).toBe(true))
    unsubscribe()

    for (const key of keys.product) expect(isInvalidated(client, key), String(key)).toBe(true)
    for (const key of keys.private) expect(isInvalidated(client, key), String(key)).toBe(false)
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(1)
  })

  it('does not navigate when the creation retry cannot save the order', async () => {
    const creation = creationHandler({ failFirstUpload: true, failOrder: true })
    const fetchMock = stubAdminFetch({ handler: creation.handler })
    const client = createTestQueryClient()
    const keys = catalogKeys()
    seedCatalog(client, keys)
    const { paths, unsubscribe } = recordInvalidatedPaths(client)
    renderCreation(fetchMock, client)

    const banner = await submitCreationWithFile()
    seedCatalog(client, keys)
    paths.length = 0

    fireEvent.click(within(banner).getByRole('button', { name: 'Повторить загрузку' }))
    expect(await screen.findByText('Товар создан, но порядок изображений не сохранён.')).toBeTruthy()
    unsubscribe()

    // A retry whose ordering was rejected is never reported as a finished upload…
    expect(screen.queryByText('EDIT PAGE')).toBeNull()
    // …but the image it accepted is committed, so the catalog must be refreshed.
    for (const key of keys.product) expect(isInvalidated(client, key), String(key)).toBe(true)
    for (const key of keys.private) expect(isInvalidated(client, key), String(key)).toBe(false)
    expect(paths.length).toBeGreaterThan(0)
  })
})

describe('admin product upload invalidation and stale navigation', () => {
  /** Orval key shapes of the data an accepted image makes stale. */
  const productKeys = () => [
    ['/api/v1/admin/products', { page: 1 }],
    // A detail key the page itself does not render, so seeding stays inert.
    ['/api/v1/admin/products/901'],
    ['/api/v1/products', { page: 1 }],
    ['/api/v1/products/filters', {}],
  ] as const
  const privateKeys = () => [
    ['/api/v1/admin/users', { page: 1 }],
    ['/api/v1/auth/me'],
    ['/api/v1/cart'],
  ] as const

  const seedKeys = (client: QueryClient) => {
    for (const key of [...productKeys(), ...privateKeys()]) client.setQueryData(key, { seeded: true })
  }
  const isInvalidated = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false

  /** Product data must be stale, private user data must not. */
  const expectProductRefreshOnly = async (client: QueryClient) => {
    await waitFor(() => expect(isInvalidated(client, productKeys()[0])).toBe(true))
    for (const key of productKeys()) expect(isInvalidated(client, key), String(key)).toBe(true)
    for (const key of privateKeys()) expect(isInvalidated(client, key), String(key)).toBe(false)
  }

  const renderCreation = (fetchMock: ReturnType<typeof vi.fn>, client: QueryClient) => {
    void fetchMock
    render(
      <MemoryRouter initialEntries={['/admin/products/new']}>
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:productId/edit" element={<div>EDIT PAGE</div>} />
        </Routes>
      </MemoryRouter>,
      { client },
    )
  }

  it('refreshes the catalog after an accepted upload even when the order request fails', async () => {
    const client = createTestQueryClient()
    seedKeys(client)
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') return jsonResponse(uploadedFixture(73), 201)
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') {
        return jsonResponse({ detail: 'Ordering failed' }, 500)
      }
      return undefined
    }, { client })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    // The page itself invalidates nothing on mount: reseed right before the mutation.
    seedKeys(client)
    expect(isInvalidated(client, productKeys()[0])).toBe(false)

    addGalleryFiles([tileFile()])
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images', 'POST')).toHaveLength(1))
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(1))

    await expectProductRefreshOnly(client)
  })

  it('refreshes the catalog when only part of a batch was accepted', async () => {
    const client = createTestQueryClient()
    seedKeys(client)
    let uploadCalls = 0
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        uploadCalls += 1
        if (uploadCalls === 1) return jsonResponse(uploadedFixture(73), 201)
        return jsonResponse({ detail: 'Unsupported image format' }, 400)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return jsonResponse([])
      return undefined
    }, { client })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    seedKeys(client)

    addGalleryFiles([tileFile('first.png'), tileFile('second.png')])
    await waitFor(() => expect(uploadCalls).toBe(2))

    await expectProductRefreshOnly(client)
    // A rejected sibling leaves the batch unfinishable: no order is persisted.
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(0)
  })

  it('does not refresh the catalog when no upload was accepted', async () => {
    const client = createTestQueryClient()
    seedKeys(client)
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        return jsonResponse({ detail: 'Unsupported image format' }, 400)
      }
      return undefined
    }, { client })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    seedKeys(client)

    addGalleryFiles([tileFile()])
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Повторить загрузку' }).length).toBeGreaterThan(0))

    for (const key of productKeys()) expect(isInvalidated(client, key), String(key)).toBe(false)
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(0)
  })

  it('refreshes the catalog when a failed-image retry is accepted but ordering fails', async () => {
    const client = createTestQueryClient()
    seedKeys(client)
    let uploadCalls = 0
    let failOrder = true
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        uploadCalls += 1
        if (uploadCalls === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
        return jsonResponse(uploadedFixture(73), 201)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') {
        return failOrder ? jsonResponse({ detail: 'Ordering failed' }, 500) : jsonResponse([uploadedFixture(73)])
      }
      return undefined
    }, { client })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку' })
    seedKeys(client)

    fireEvent.click(retry)
    await waitFor(() => expect(uploadCalls).toBe(2))
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(1))
    await expectProductRefreshOnly(client)

    // The accepted image is reused by the order-only retry: never uploaded twice.
    failOrder = false
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить сохранение порядка' }))
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(2))
    expect(uploadCalls).toBe(2)
    const orders = requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')
    expect((requestBody(orders.at(-1)?.[1] ?? {}) as { image_ids: number[] }).image_ids).toEqual([71, 72, 73])
  })

  it('refreshes the catalog from the creation retry even when ordering keeps failing', async () => {
    const client = createTestQueryClient()
    const creation = creationHandler({ failFirstUpload: true, failOrder: true })
    const fetchMock = stubAdminFetch({ handler: creation.handler })
    seedKeys(client)
    renderCreation(fetchMock, client)

    const banner = await submitCreationWithFile()
    // Product creation already refreshed the catalog: reset it so only the
    // retry's own invalidation can satisfy the assertion.
    seedKeys(client)
    await waitFor(() => expect(isInvalidated(client, productKeys()[0])).toBe(false))

    fireEvent.click(within(banner).getByRole('button', { name: 'Повторить загрузку' }))
    expect(await screen.findByText('Товар создан, но порядок изображений не сохранён.')).toBeTruthy()

    await expectProductRefreshOnly(client)
    expect(screen.queryByText('EDIT PAGE')).toBeNull()
  })

  it('refreshes the catalog when images are accepted after creation but ordering fails', async () => {
    const client = createTestQueryClient()
    seedKeys(client)
    const pendingUpload = deferred<Response>()
    const fetchMock = stubAdminFetch({
      handler: (url, init) => {
        const method = init.method ?? 'GET'
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
        if (url.pathname === '/api/v1/admin/products' && method === 'POST') {
          return jsonResponse({ ...productDetailFixture, id: 900, images: [], review_count: 0, average_rating: 0 }, 201)
        }
        if (url.pathname === '/api/v1/admin/products/900/images' && method === 'POST') return pendingUpload.promise
        if (url.pathname === '/api/v1/admin/products/900/images/order' && method === 'PUT') {
          return jsonResponse({ detail: 'Ordering failed' }, 500)
        }
        return undefined
      },
    })
    renderCreation(fetchMock, client)

    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })
    addGalleryFiles([tileFile('photo.png')])
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))

    // Wait until the row is created and the upload is in flight, then reset the
    // cache: only the accepted image may invalidate it from here on.
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/900/images', 'POST')).toHaveLength(1))
    seedKeys(client)
    await waitFor(() => expect(isInvalidated(client, productKeys()[0])).toBe(false))

    await act(async () => { pendingUpload.resolve(jsonResponse(uploadedFixture(901), 201)) })

    expect(await screen.findByText('Товар создан, но порядок изображений не сохранён.')).toBeTruthy()
    await expectProductRefreshOnly(client)
    expect(screen.queryByText('EDIT PAGE')).toBeNull()
    expect(requestsTo(fetchMock, '/api/v1/admin/products/900/images/order', 'PUT')).toHaveLength(1)
  })

  it('does not redirect back to the editor when the upload finishes after the admin left', async () => {
    const client = createTestQueryClient()
    seedKeys(client)
    const pendingUpload = deferred<Response>()
    const pendingOrder = deferred<Response>()
    const fetchMock = stubAdminFetch({
      handler: (url, init) => {
        const method = init.method ?? 'GET'
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
        if (url.pathname === '/api/v1/admin/products' && method === 'POST') {
          return jsonResponse({ ...productDetailFixture, id: 900, images: [], review_count: 0, average_rating: 0 }, 201)
        }
        if (url.pathname === '/api/v1/admin/products/900/images' && method === 'POST') return pendingUpload.promise
        if (url.pathname === '/api/v1/admin/products/900/images/order' && method === 'PUT') return pendingOrder.promise
        return undefined
      },
    })

    function LocationProbe() {
      const location = useLocation()
      return <output data-testid="location">{location.pathname}</output>
    }

    function LeaveControl() {
      const navigate = useNavigate()
      return <button type="button" onClick={() => navigate('/admin/products')}>leave page</button>
    }

    render(
      <MemoryRouter initialEntries={['/admin/products/new']}>
        <LocationProbe />
        <LeaveControl />
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:productId/edit" element={<div>EDIT PAGE</div>} />
          <Route path="/admin/products" element={<div>PRODUCTS LIST</div>} />
        </Routes>
      </MemoryRouter>,
      { client },
    )

    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })
    addGalleryFiles([tileFile('photo.png')])
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))

    // The product is created and its image upload stays pending while the admin leaves.
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/900/images', 'POST')).toHaveLength(1))
    // Reset the cache after the creation invalidated it: the accepted image must
    // still refresh the catalog even though the continuation cannot navigate.
    seedKeys(client)
    await waitFor(() => expect(isInvalidated(client, productKeys()[0])).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: 'leave page' }))
    expect(await screen.findByText('PRODUCTS LIST')).toBeTruthy()

    await act(async () => { pendingUpload.resolve(jsonResponse(uploadedFixture(901), 201)) })
    await act(async () => { pendingOrder.resolve(jsonResponse([uploadedFixture(901)])) })

    // The finished upload must not pull the administrator back into the editor.
    expect(screen.getByTestId('location').textContent).toBe('/admin/products')
    expect(screen.queryByText('EDIT PAGE')).toBeNull()
    // The committed writes still refreshed the catalog.
    await expectProductRefreshOnly(client)
  })
})

describe('admin product gallery concurrency', () => {
  it('uploads a failed image only once when the retry is clicked twice in the same tick', async () => {
    const pendingUpload = deferred<Response>()
    let uploadCalls = 0
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        uploadCalls += 1
        if (uploadCalls === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
        return pendingUpload.promise
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return jsonResponse([])
      return undefined
    })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку' })
    expect(uploadCalls).toBe(1)

    await act(async () => {
      fireEvent.click(retry)
      // The second click arrives before React re-renders the disabled button.
      fireEvent.click(retry)
    })
    expect(uploadCalls).toBe(2)

    await act(async () => { pendingUpload.resolve(jsonResponse(uploadedFixture(73), 201)) })
    await waitFor(() => expect(galleryTiles()).toHaveLength(3))
    expect(uploadCalls).toBe(2)
    const orders = requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')
    expect(orders).toHaveLength(1)
    expect((requestBody(orders[0]?.[1] ?? {}) as { image_ids: number[] }).image_ids).toEqual([71, 72, 73])
  })

  it('does not start a delete while an upload retry is pending', async () => {
    const pendingUpload = deferred<Response>()
    let uploadCalls = 0
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        uploadCalls += 1
        if (uploadCalls === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
        return pendingUpload.promise
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return jsonResponse([])
      return undefined
    })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку' })
    const removeButton = () =>
      galleryTiles()[0]?.querySelector('button[aria-label^="Удалить изображение"]') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(retry)
      fireEvent.click(removeButton())
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/72', 'DELETE')).toHaveLength(0)

    await act(async () => { pendingUpload.resolve(jsonResponse(uploadedFixture(73), 201)) })
    await waitFor(() => expect(galleryTiles()).toHaveLength(3))
    // Once the workflow finished, the gallery accepts a deletion again.
    fireEvent.click(removeButton())
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('does not persist a reorder started while an upload is pending', async () => {
    const pendingUpload = deferred<Response>()
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') return pendingUpload.promise
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return jsonResponse([])
      return undefined
    })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    await waitFor(() => expect(galleryTiles()).toHaveLength(3))

    const tiles = galleryTiles()
    fireEvent.dragStart(tiles[0] as HTMLElement, { dataTransfer: { files: [], types: [] } })
    fireEvent.drop(tiles[2] as HTMLElement, { dataTransfer: { files: [], types: [] } })
    // The reorder is rejected instead of racing the upload, and nothing moved.
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(0)
    expect(tileSources()[0]).toBe('/photo-1.png')

    await act(async () => { pendingUpload.resolve(jsonResponse(uploadedFixture(73), 201)) })
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(1))
    expect(tileSources()).toEqual(['/photo-1.png', '/photo-2.png', '/uploaded-73.png'])
  })

  it('sends a single ordering request when the order retry is clicked twice', async () => {
    const pendingOrder = deferred<Response>()
    let orderCalls = 0
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        return jsonResponse(uploadedFixture(73), 201)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') {
        orderCalls += 1
        if (orderCalls === 1) return jsonResponse({ detail: 'Ordering failed' }, 500)
        return pendingOrder.promise
      }
      return undefined
    })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    const retry = await screen.findByRole('button', { name: 'Повторить сохранение порядка' })
    expect(orderCalls).toBe(1)

    await act(async () => {
      fireEvent.click(retry)
      fireEvent.click(retry)
    })
    expect(orderCalls).toBe(2)

    await act(async () => { pendingOrder.resolve(jsonResponse([])) })
    await waitFor(() => expect(screen.queryByText('Порядок изображений не сохранён.')).toBeNull())
    expect(orderCalls).toBe(2)
    // The accepted image was never uploaded again.
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images', 'POST')).toHaveLength(1)
  })

  it('does not start a delete while the order retry is pending', async () => {
    const pendingOrder = deferred<Response>()
    let orderCalls = 0
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        return jsonResponse(uploadedFixture(73), 201)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') {
        orderCalls += 1
        if (orderCalls === 1) return jsonResponse({ detail: 'Ordering failed' }, 500)
        return pendingOrder.promise
      }
      return undefined
    })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile()])
    const retry = await screen.findByRole('button', { name: 'Повторить сохранение порядка' })
    const removeButton = () =>
      galleryTiles()[0]?.querySelector('button[aria-label^="Удалить изображение"]') as HTMLButtonElement

    await act(async () => {
      fireEvent.click(retry)
      fireEvent.click(removeButton())
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/73', 'DELETE')).toHaveLength(0)

    await act(async () => { pendingOrder.resolve(jsonResponse([])) })
    await waitFor(() => expect(screen.queryByText('Порядок изображений не сохранён.')).toBeNull())
    fireEvent.click(removeButton())
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('retries only the failed image and keeps the accepted ids and cover order', async () => {
    let uploadCalls = 0
    const fetchMock = setupEditGallery((url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/products/7/images' && method === 'POST') {
        uploadCalls += 1
        if (uploadCalls === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
        return jsonResponse(uploadedFixture(80 + uploadCalls), 201)
      }
      if (url.pathname === '/api/v1/admin/products/7/images/order' && method === 'PUT') return jsonResponse([])
      return undefined
    })

    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect(galleryTiles()).toHaveLength(2))
    addGalleryFiles([tileFile('a.png'), tileFile('b.png')])
    // The first file fails, the second one is accepted; the order waits.
    const retry = await screen.findByRole('button', { name: 'Повторить загрузку' })
    expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(0)
    expect(uploadCalls).toBe(2)

    fireEvent.click(retry)
    await waitFor(() => expect(requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')).toHaveLength(1))
    expect(uploadCalls).toBe(3)
    const orders = requestsTo(fetchMock, '/api/v1/admin/products/7/images/order', 'PUT')
    expect((requestBody(orders[0]?.[1] ?? {}) as { image_ids: number[] }).image_ids).toEqual([71, 72, 83, 82])
    expect(tileSources()[0]).toBe('/photo-1.png')
  })

  it('uploads once when the creation-mode retry is clicked twice in the same tick', async () => {
    const pendingUpload = deferred<Response>()
    let uploadCalls = 0
    const fetchMock = stubAdminFetch({
      handler: (url, init) => {
        const method = init.method ?? 'GET'
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        if (url.pathname === '/api/v1/admin/product-types/8/spec-fields') return jsonResponse(specTemplateFixture)
        if (url.pathname === '/api/v1/admin/products' && method === 'POST') {
          return jsonResponse({ ...productDetailFixture, id: 900, images: [], review_count: 0, average_rating: 0 }, 201)
        }
        if (url.pathname === '/api/v1/admin/products/900/images' && method === 'POST') {
          uploadCalls += 1
          if (uploadCalls === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
          return pendingUpload.promise
        }
        if (url.pathname === '/api/v1/admin/products/900/images/order' && method === 'PUT') return jsonResponse([])
        return undefined
      },
    })
    render(
      <MemoryRouter initialEntries={['/admin/products/new']}>
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:productId/edit" element={<div>EDIT PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )

    const banner = await submitCreationWithFile()
    const retry = within(banner).getByRole('button', { name: 'Повторить загрузку' })
    await act(async () => {
      fireEvent.click(retry)
      fireEvent.click(retry)
    })
    expect(uploadCalls).toBe(2)

    await act(async () => { pendingUpload.resolve(jsonResponse(uploadedFixture(901), 201)) })
    await waitFor(() => expect(screen.getByText('EDIT PAGE')).toBeTruthy())
    expect(uploadCalls).toBe(2)
    expect(callsTo(fetchMock, '/api/v1/admin/products').filter(([, init]) => init.method === 'POST')).toHaveLength(1)
  })
})
