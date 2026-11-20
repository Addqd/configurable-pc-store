import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { act } from 'react'
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

describe('admin product upload retry cache refresh', () => {
  it('invalidates admin and public catalog queries after a successful retry', async () => {
    let uploadAttempts = 0
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
          uploadAttempts += 1
          if (uploadAttempts === 1) return jsonResponse({ detail: 'Unsupported image format' }, 400)
          return jsonResponse({ id: 901, url: '/uploaded.png', alt_text: null, sort_order: 0, is_cover: true }, 201)
        }
        if (url.pathname === '/api/v1/admin/products/900/images/order' && method === 'PUT') {
          return jsonResponse([{ id: 901, url: '/uploaded.png', alt_text: null, sort_order: 0, is_cover: true }])
        }
        return undefined
      },
    })

    const client = createTestQueryClient()
    const adminDetailKey = ['/api/v1/admin/products/900']
    const adminListKey = ['/api/v1/admin/products', { page: 1 }]
    const publicImagesKey = ['/api/v1/products/7/images']
    const publicDetailKey = ['/api/v1/products/gpu-rtx-4070-super']
    const privateUsersKey = ['/api/v1/admin/users', { page: 1 }]
    for (const key of [adminDetailKey, adminListKey, publicImagesKey, publicDetailKey, privateUsersKey]) {
      client.setQueryData(key, { seeded: true })
    }
    const isInvalidated = (key: readonly unknown[]) =>
      client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false

    render(
      <MemoryRouter initialEntries={['/admin/products/new']}>
        <Routes>
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/:productId/edit" element={<div>EDIT PAGE</div>} />
        </Routes>
      </MemoryRouter>,
      { client },
    )
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12 ГБ' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '192 бит' } })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
    const banner = (await screen.findByText('Товар создан, но не удалось загрузить изображения: 1.')).closest('[role="alert"]')
    if (!banner) throw new Error('upload failure banner missing')

    fireEvent.click(within(banner as HTMLElement).getByRole('button', { name: 'Повторить загрузку' }))
    await waitFor(() => expect(screen.getByText('EDIT PAGE')).toBeTruthy())

    expect(uploadAttempts).toBe(2)
    expect(isInvalidated(adminDetailKey)).toBe(true)
    expect(isInvalidated(adminListKey)).toBe(true)
    expect(isInvalidated(publicImagesKey)).toBe(true)
    expect(isInvalidated(publicDetailKey)).toBe(true)
    // Private user data is unrelated to a product image change.
    expect(isInvalidated(privateUsersKey)).toBe(false)
    expect(callsTo(fetchMock, '/api/v1/admin/products/900/images/order').filter(([, init]) => init.method === 'PUT')).toHaveLength(1)
  })
})
