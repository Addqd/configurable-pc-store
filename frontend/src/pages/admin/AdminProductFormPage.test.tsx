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
  characteristicDefinitionsFixture, stubAdminFetch,
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
    if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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

  it('sends the contract payload, including the dictionary selections', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)

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
      characteristics: [
        { code: 'memory_size', options: [{ option_id: 12, quantity: 1 }] },
        { code: 'memory_bus', options: [{ option_id: 22, quantity: 1 }] },
      ],
      is_active: true,
    })
  })

  it('reports a missing required characteristic before submitting', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)

    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }))
    expect(await screen.findByText(/Заполните обязательные характеристики: Шина памяти/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST')).toBe(false)
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
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '22' } })

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
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '22' } })

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
    if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
    if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(detail)
    if (url.pathname === '/api/v1/admin/products/7' && method === 'PATCH') {
      const body = requestBody(init) as { price?: string }
      // The stored rows are returned unchanged: a real API answers with the
      // committed product, never with the submitted payload shape.
      return jsonResponse({ ...detail, price: body.price ?? detail.price })
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

  it('keeps the save button disabled and relabelled until the definitions resolve', async () => {
    // Proves the precondition the save flows rely on: while the definitions are in
    // flight the submit button is disabled and shows the pending label, so neither a
    // click nor a query by the idle label can succeed yet.
    let resolveDefinitions: (value: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => { resolveDefinitions = resolve })
    stubAdminFetch({
      handler: (url, init) => {
        const method = init.method ?? 'GET'
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        if (url.pathname === '/api/v1/admin/categories/8/characteristics') return pending
        if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') {
          return jsonResponse(productDetailFixture)
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

    const price = (await screen.findByLabelText(/Цена, ₽/)) as HTMLInputElement
    expect(price.value.replace(/\s/g, ' ')).toBe('64 990')
    const submitButton = () => document.querySelector('form button[type="submit"]') as HTMLButtonElement
    expect(submitButton().disabled).toBe(true)
    expect(submitButton().textContent).toContain('Сохранение')
    expect(screen.queryByRole('button', { name: 'Сохранить изменения' })).toBeNull()

    resolveDefinitions(jsonResponse(characteristicDefinitionsFixture))
    await screen.findByLabelText('Объём памяти')
    await waitFor(() => expect(submitButton().disabled).toBe(false))
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeTruthy()
  })

  it('saves an unchanged grouped price as a numeric API value', async () => {
    const fetchMock = setupEdit()
    expect(await screen.findByRole('heading', { name: 'Редактирование товара' })).toBeTruthy()
    const price = (await screen.findByLabelText(/Цена, ₽/)) as HTMLInputElement
    expect(price.value.replace(/\s/g, ' ')).toBe('64 990')

    // The submit button stays disabled until the category definitions resolve, so
    // the save goes through the shared helper that awaits them: a direct click can
    // land on a disabled button and silently send nothing.
    await submitForm()
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
        if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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
        if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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
  // The submit button stays disabled until the category definitions resolve.
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
    // The submit button waits for the definitions of the chosen category.
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
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '22' } })
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
      if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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
    if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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
  fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12' } })
  fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '22' } })
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
        if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '22' } })
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
        if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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
    fireEvent.change(await screen.findByLabelText('Объём памяти'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Шина памяти'), { target: { value: '22' } })
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
        if (url.pathname === '/api/v1/admin/categories/8/characteristics') return jsonResponse(characteristicDefinitionsFixture)
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


/* ── Dictionary-backed characteristic editing ──────────────────────────────── */

/** One API characteristic row of the GPU category fixture. */
const characteristicRow = (overrides: Record<string, unknown>) => ({
  code: 'memory_size', name: 'Объём памяти', data_type: 'string', editor: 'select', unit: null,
  sort_order: 0, is_required: true, show_in_short: true, show_in_details: true,
  value: '12 ГБ', display_value: '12 ГБ',
  options: [{ option_id: 12, value: '12 ГБ', quantity: 1 }], ...overrides,
})

const memorySizeRow = () => characteristicRow({})
const memoryBusRow = () => characteristicRow({
  code: 'memory_bus', name: 'Шина памяти', data_type: 'number', editor: 'select', unit: 'бит',
  sort_order: 1, is_required: true, show_in_short: false, value: 192, display_value: '192 бит',
  options: [{ option_id: 22, value: '192 бит', quantity: 1 }],
})
const rgbRow = (value: boolean) => characteristicRow({
  code: 'has_rgb', name: 'Подсветка', data_type: 'boolean', editor: 'boolean', unit: null,
  sort_order: 2, is_required: false, show_in_short: false, value,
  display_value: value ? 'Да' : 'Нет',
  options: [{ option_id: value ? 31 : 32, value: value ? 'Да' : 'Нет', quantity: 1 }],
})
const connectorsRow = (value: string[], quantity = 1) => characteristicRow({
  code: 'power_connectors', name: 'Разъёмы питания', data_type: 'string_list',
  editor: 'connector_quantity', unit: null,
  sort_order: 3, is_required: false, show_in_short: false,
  value, display_value: value.join(', '),
  options: [...new Set(value)].map((item) => ({
    option_id: item === 'PCIe 8-pin' ? 41 : 42, value: item, quantity,
  })),
})
const chipsetRow = () => characteristicRow({
  code: 'chipset', name: 'Чипсет', data_type: 'string', editor: 'select', unit: null, sort_order: 0,
  is_required: false, show_in_short: false, value: 'B650', display_value: 'B650',
  options: [{ option_id: 61, value: 'B650', quantity: 1 }],
})

/** Display text of one dictionary option, resolved from the definitions fixture. */
const optionText = (optionId: number): string => {
  for (const field of characteristicDefinitionsFixture.fields) {
    const match = field.options.find((option) => option.option_id === optionId)
    if (match) return match.value
  }
  return ''
}

interface CharacteristicPayloadEntry {
  code: string
  options?: { option_id: number; quantity: number }[]
  dimensions?: number[]
}

interface PatchBody {
  characteristics?: CharacteristicPayloadEntry[]
  remove_characteristics?: string[]
}

/** Edit screen whose stored characteristics are known. */
function setupEditCharacteristics(rows: Array<Record<string, unknown>>) {
  const detail = { ...productDetailFixture, characteristics: rows }
  const fetchMock = stubAdminFetch({
    handler: (url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
      if (url.pathname === '/api/v1/products/filters') {
        return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
      }
      if (url.pathname === '/api/v1/admin/categories/8/characteristics') {
        return jsonResponse(characteristicDefinitionsFixture)
      }
      if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') return jsonResponse(detail)
      if (url.pathname === '/api/v1/admin/products/7' && method === 'PATCH') {
        const body = requestBody(init) as PatchBody
        const removed = new Set(body.remove_characteristics ?? [])
        const submitted = new Map((body.characteristics ?? []).map((entry) => [entry.code, entry]))
        const updated = rows
          .filter((row) => !removed.has(String(row.code)))
          .map((row) => {
            const entry = submitted.get(String(row.code))
            if (!entry) return row
            const options = entry.options ?? []
            const texts = options.map((option) => optionText(option.option_id))
            return {
              ...row,
              value: entry.dimensions ?? texts,
              display_value: entry.dimensions
                ? `${entry.dimensions.join(' × ')} мм`
                : texts.join(', '),
              options: options.map((option) => ({
                option_id: option.option_id,
                value: optionText(option.option_id),
                quantity: option.quantity,
              })),
            }
          })
        return jsonResponse({ ...detail, characteristics: updated })
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
  return fetchMock
}

const patchBodies = (fetchMock: ReturnType<typeof vi.fn>) => callsTo(fetchMock, '/api/v1/admin/products/7')
  .filter(([, init]) => init.method === 'PATCH')
  .map(([, init]) => requestBody(init) as PatchBody)

const patchBody = (fetchMock: ReturnType<typeof vi.fn>) => patchBodies(fetchMock).at(-1) ?? null

const submittedEntry = (body: PatchBody, code: string) =>
  body.characteristics?.find((entry) => entry.code === code)

/** Picks one dictionary option of a select-based characteristic. */
const pickOption = (label: string, optionId: number | '') => {
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(optionId) } })
}

/** Toggles one option of a multiselect or connector characteristic. */
const toggleOption = (label: string) => {
  fireEvent.click(screen.getByLabelText(label))
}

const renameProduct = () => {
  fireEvent.change(screen.getByLabelText(/Название товара/), { target: { value: 'Другой товар' } })
}

describe('admin product characteristic editing', () => {
  it('renders a control per declared editor and offers only dictionary values', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: '8' } })

    // Scalar characteristics are a searchable single select over the dictionary.
    const memory = (await screen.findByLabelText('Объём памяти')) as HTMLSelectElement
    expect(memory.tagName).toBe('SELECT')
    expect([...memory.options].map((option) => option.value)).toEqual(['', '11', '12', '13'])
    expect(memory.value).toBe('')

    // A boolean starts "not set" instead of an unchecked box.
    const boolean = screen.getByLabelText('Подсветка') as HTMLSelectElement
    expect([...boolean.options].map((option) => option.value)).toEqual(['', '31', '32'])
    expect(boolean.value).toBe('')

    // Repeated connectors are checkboxes with a quantity control, not free text.
    const connector = screen.getByLabelText('PCIe 8-pin') as HTMLInputElement
    expect(connector.type).toBe('checkbox')

    // The dimensions field is exactly three numbered inputs.
    for (const label of ['Длина, мм', 'Ширина, мм', 'Высота, мм']) {
      expect(screen.getByLabelText(label).tagName).toBe('INPUT')
    }
    expect(screen.queryByLabelText('Габариты 2')).toBeNull()
  })

  it('renders one ordinary dropdown per fixed characteristic without a search field', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: '8' } })
    await screen.findByLabelText('Объём памяти')

    // One control per value: no separate search input and no option counter.
    expect(screen.queryByLabelText('Поиск значений: Объём памяти')).toBeNull()
    // The counter is only part of the multiple-choice checklist, never of a
    // single-value control.
    expect(screen.getAllByText(/Доступно значений/)).toHaveLength(1)
    const memory = screen.getByLabelText('Объём памяти') as HTMLSelectElement
    expect(memory.tagName).toBe('SELECT')
    expect([...memory.options].map((option) => option.textContent)).toEqual([
      'Снять выбор',
      '8 ГБ',
      '12 ГБ',
      '16 ГБ',
    ])

    // A boolean stays an ordinary Yes/No dropdown with an unset state.
    const boolean = screen.getByLabelText('Подсветка') as HTMLSelectElement
    expect(boolean.tagName).toBe('SELECT')
    expect([...boolean.options].map((option) => option.textContent)).toEqual([
      'Снять выбор',
      'Да',
      'Нет',
    ])
  })

  it('sends explicit option ids and quantities, never free text', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)
    toggleOption('PCIe 8-pin')
    fireEvent.change(screen.getByLabelText('Количество: PCIe 8-pin'), { target: { value: '4' } })

    await submitForm()
    expect(await screen.findByText('EDIT PAGE')).toBeTruthy()
    const post = callsTo(fetchMock, '/api/v1/admin/products').find(([, init]) => init.method === 'POST')
    const body = requestBody(post?.[1] ?? {}) as PatchBody
    expect(body.characteristics).toEqual([
      { code: 'memory_size', options: [{ option_id: 12, quantity: 1 }] },
      { code: 'memory_bus', options: [{ option_id: 22, quantity: 1 }] },
      { code: 'power_connectors', options: [{ option_id: 41, quantity: 4 }] },
    ])
  })

  it('reports a missing required characteristic before submitting', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)

    await submitForm()
    expect(await screen.findByText(/Заполните обязательные характеристики: Шина памяти/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST')).toBe(false)
  })

  it('rejects an invalid dimension instead of repairing it', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)
    fireEvent.change(screen.getByLabelText('Длина, мм'), { target: { value: '1 2' } })
    fireEvent.change(screen.getByLabelText('Ширина, мм'), { target: { value: '125' } })
    fireEvent.change(screen.getByLabelText('Высота, мм'), { target: { value: '46' } })

    await submitForm()
    expect(await screen.findByText(/Каждое измерение — число больше 0/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST')).toBe(false)
  })

  it('submits exactly three measurements for the dimensions field', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)
    fireEvent.change(screen.getByLabelText('Длина, мм'), { target: { value: '320' } })
    fireEvent.change(screen.getByLabelText('Ширина, мм'), { target: { value: '134,85' } })
    fireEvent.change(screen.getByLabelText('Высота, мм'), { target: { value: '61.57' } })

    await submitForm()
    expect(await screen.findByText('EDIT PAGE')).toBeTruthy()
    const post = callsTo(fetchMock, '/api/v1/admin/products').find(([, init]) => init.method === 'POST')
    const body = requestBody(post?.[1] ?? {}) as PatchBody
    expect(submittedEntry(body, 'dimensions_mm')).toEqual({
      code: 'dimensions_mm',
      dimensions: [320, 134.85, 61.57],
    })
  })

  it('edits an allowlisted numeric field with one integrated ComboBox', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)

    // A single integrated control: an editable combobox, no second search field.
    const combo = screen.getByRole('combobox', { name: 'Длина' }) as HTMLInputElement
    expect(combo.tagName).toBe('INPUT')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Поиск значений: Длина')).toBeNull()
    expect(document.querySelectorAll('#characteristic-length_mm-listbox')).toHaveLength(0)

    // Focusing it offers the existing dictionary values by numeric magnitude.
    fireEvent.focus(combo)
    const listValues = () => [...document.querySelectorAll('#characteristic-length_mm-listbox [role="option"]')]
      .map((node) => node.textContent)
    expect(listValues()).toEqual(['234.1 мм', '305 мм', '357.6 мм'])

    // Typing filters the dictionary inside the popup and calls no endpoint.
    const before = fetchMock.mock.calls.length
    fireEvent.change(combo, { target: { value: '305' } })
    expect(listValues()).toEqual(['305 мм'])
    expect(fetchMock.mock.calls.length).toBe(before)

    // Picking an option keeps its original dictionary id.
    fireEvent.click(screen.getByRole('option', { name: '305 мм' }))
    expect(combo.value).toBe('305')
    expect(combo.getAttribute('aria-expanded')).toBe('false')

    await submitForm()
    expect(await screen.findByText('EDIT PAGE')).toBeTruthy()
    const post = callsTo(fetchMock, '/api/v1/admin/products').find(([, init]) => init.method === 'POST')
    const body = requestBody(post?.[1] ?? {}) as PatchBody
    expect(submittedEntry(body, 'length_mm')).toEqual({
      code: 'length_mm', options: [{ option_id: 62, quantity: 1 }],
    })
  })

  it('submits a typed numeric value as a plain decimal and converts one comma', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)

    fireEvent.change(screen.getByRole('combobox', { name: 'Длина' }), {
      target: { value: '269,1' },
    })
    await submitForm()
    expect(await screen.findByText('EDIT PAGE')).toBeTruthy()
    const post = callsTo(fetchMock, '/api/v1/admin/products').find(([, init]) => init.method === 'POST')
    const body = requestBody(post?.[1] ?? {}) as PatchBody
    expect(submittedEntry(body, 'length_mm')).toEqual({
      code: 'length_mm', numeric_value: '269.1',
    })
  })

  it('rejects an invalid numeric value instead of repairing it', async () => {
    const fetchMock = setup()
    await screen.findByRole('heading', { name: 'Добавление товара' })
    fillRequiredFields()
    await screen.findByLabelText('Объём памяти')
    pickOption('Объём памяти', 12)
    pickOption('Шина памяти', 22)

    fireEvent.change(screen.getByRole('combobox', { name: 'Длина' }), {
      target: { value: '1 2' },
    })
    await submitForm()
    expect(await screen.findByText(/Введите число без пробелов и единиц/)).toBeTruthy()
    expect(
      callsTo(fetchMock, '/api/v1/admin/products').some(([, init]) => init.method === 'POST'),
    ).toBe(false)
  })

  it('hydrates a stored numeric value and clears it explicitly', async () => {
    const numericRow = characteristicRow({
      code: 'length_mm', name: 'Длина', data_type: 'number', editor: 'numeric', unit: 'мм',
      sort_order: 5, is_required: false, value: 269.1, display_value: '269.1 мм',
      options: [{ option_id: 32, value: '269.1 мм', quantity: 1 }],
    })
    const fetchMock = setupEditCharacteristics([memorySizeRow(), memoryBusRow(), numericRow])
    await screen.findByRole('heading', { name: 'Редактирование товара' })

    const combo = (await screen.findByRole('combobox', { name: 'Длина' })) as HTMLInputElement
    expect(combo.value).toBe('269.1')

    fireEvent.click(screen.getByRole('button', { name: 'Очистить значение' }))
    expect(combo.value).toBe('')

    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())
    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect(body.remove_characteristics).toEqual(['length_mm'])
    expect(submittedEntry(body, 'length_mm')).toBeUndefined()
  })

  it('removes an optional stored characteristic the administrator cleared', async () => {
    const fetchMock = setupEditCharacteristics([memorySizeRow(), memoryBusRow(), rgbRow(true)])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const toggle = (await screen.findByLabelText('Подсветка')) as HTMLSelectElement
    expect(toggle.value).toBe('31')

    pickOption('Подсветка', '')
    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())

    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect(body.remove_characteristics).toEqual(['has_rgb'])
    expect(submittedEntry(body, 'has_rgb')).toBeUndefined()
    // Untouched values are re-submitted with their own option ids.
    expect(submittedEntry(body, 'memory_size')).toEqual({
      code: 'memory_size', options: [{ option_id: 12, quantity: 1 }],
    })
    const submitted = new Set((body.characteristics ?? []).map((entry) => entry.code))
    expect((body.remove_characteristics ?? []).filter((code) => submitted.has(code))).toEqual([])

    await waitFor(() => expect((screen.getByLabelText('Подсветка') as HTMLSelectElement).value).toBe(''))
  })

  it('submits an explicit negative boolean instead of omitting it', async () => {
    const fetchMock = setupEditCharacteristics([memorySizeRow(), memoryBusRow(), rgbRow(true)])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await screen.findByLabelText('Подсветка')
    pickOption('Подсветка', 32)
    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())

    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect(submittedEntry(body, 'has_rgb')).toEqual({
      code: 'has_rgb', options: [{ option_id: 32, quantity: 1 }],
    })
    expect(body.remove_characteristics).toBeUndefined()
  })

  it('preserves a stored connector quantity when another field changes', async () => {
    const fetchMock = setupEditCharacteristics([
      memorySizeRow(), memoryBusRow(), rgbRow(false), connectorsRow(['PCIe 8-pin', 'PCIe 8-pin'], 2),
    ])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await screen.findByLabelText('Шина памяти')
    pickOption('Шина памяти', 23)
    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())

    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect(submittedEntry(body, 'memory_bus')).toEqual({
      code: 'memory_bus', options: [{ option_id: 23, quantity: 1 }],
    })
    expect(submittedEntry(body, 'has_rgb')).toEqual({
      code: 'has_rgb', options: [{ option_id: 32, quantity: 1 }],
    })
    expect(submittedEntry(body, 'power_connectors')).toEqual({
      code: 'power_connectors', options: [{ option_id: 41, quantity: 2 }],
    })
    expect(body.remove_characteristics).toBeUndefined()
  })

  it('hydrates the stored dimensions into the three inputs', async () => {
    const fetchMock = setupEditCharacteristics([
      memorySizeRow(), memoryBusRow(),
      characteristicRow({
        code: 'dimensions_mm', name: 'Габариты', data_type: 'number_list', editor: 'dimensions',
        unit: 'мм', sort_order: 4, is_required: false, show_in_short: false,
        value: [320, 134.85, 61.57], display_value: '320 × 134.85 × 61.57 мм',
        options: [{ option_id: 51, value: '320 × 134.85 × 61.57 мм', quantity: 1 }],
      }),
    ])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await waitFor(() => expect((screen.getByLabelText('Длина, мм') as HTMLInputElement).value).toBe('320'))
    expect((screen.getByLabelText('Ширина, мм') as HTMLInputElement).value).toBe('134.85')
    expect((screen.getByLabelText('Высота, мм') as HTMLInputElement).value).toBe('61.57')

    // An unrelated edit keeps the stored value as it is.
    renameProduct()
    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())
    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect(submittedEntry(body, 'dimensions_mm')).toEqual({
      code: 'dimensions_mm', dimensions: [320, 134.85, 61.57],
    })
    expect(body.remove_characteristics).toBeUndefined()
  })

  it('never deletes a stored numeric value because the input is whitespace', async () => {
    const numericRow = characteristicRow({
      code: 'length_mm', name: 'Длина', data_type: 'number', editor: 'numeric', unit: 'мм',
      sort_order: 5, is_required: false, value: 269.1, display_value: '269.1 мм',
      options: [{ option_id: 32, value: '269.1 мм', quantity: 1 }],
    })
    const fetchMock = setupEditCharacteristics([memorySizeRow(), memoryBusRow(), numericRow])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const combo = (await screen.findByRole('combobox', { name: 'Длина' })) as HTMLInputElement
    expect(combo.value).toBe('269.1')

    // A single-line input cannot hold a newline (the HTML value sanitization
    // algorithm strips it), so the newline case is asserted on the draft level in
    // `characteristicDrafts.test.ts` instead.
    for (const whitespace of [' ', '   ', '\t', ' 1 2 ']) {
      fireEvent.change(combo, { target: { value: whitespace } })
      await submitForm()
      // Malformed text is a validation error, never a removal request.
      expect(await screen.findByText(/Введите число без пробелов и единиц/)).toBeTruthy()
      expect(patchBody(fetchMock)).toBeNull()
    }

    // A genuine clear still removes the stored value explicitly.
    fireEvent.change(combo, { target: { value: '269.1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Очистить значение' }))
    expect(combo.value).toBe('')
    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())
    expect(patchBody(fetchMock)?.remove_characteristics).toEqual(['length_mm'])
  })

  it('keeps the saved numeric value and dimensions after a save', async () => {
    const numericRow = characteristicRow({
      code: 'length_mm', name: 'Длина', data_type: 'number', editor: 'numeric', unit: 'мм',
      sort_order: 5, is_required: false, value: 234.1, display_value: '234.1 мм',
      options: [{ option_id: 61, value: '234.1 мм', quantity: 1 }],
    })
    const dimensionsRow = characteristicRow({
      code: 'dimensions_mm', name: 'Габариты', data_type: 'number_list', editor: 'dimensions',
      unit: 'мм', sort_order: 4, is_required: false,
      value: [307, 125, 46], display_value: '307 × 125 × 46 мм',
      options: [{ option_id: 51, value: '307 × 125 × 46 мм', quantity: 1 }],
    })
    const fetchMock = setupEditCharacteristics([
      memorySizeRow(), memoryBusRow(), numericRow, dimensionsRow,
    ])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const combo = (await screen.findByRole('combobox', { name: 'Длина' })) as HTMLInputElement
    expect(combo.value).toBe('234.1')

    fireEvent.focus(combo)
    fireEvent.click(screen.getByRole('option', { name: '305 мм' }))
    fireEvent.change(screen.getByLabelText('Ширина, мм'), { target: { value: '130' } })
    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())

    // The committed response hydrates the editor again: nothing is lost or removed.
    await waitFor(() => expect(
      (screen.getByRole('combobox', { name: 'Длина' }) as HTMLInputElement).value,
    ).toBe('305'))
    expect((screen.getByLabelText('Длина, мм') as HTMLInputElement).value).toBe('307')
    expect((screen.getByLabelText('Ширина, мм') as HTMLInputElement).value).toBe('130')
    expect((screen.getByLabelText('Высота, мм') as HTMLInputElement).value).toBe('46')

    await submitForm()
    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(2))
    const second = patchBodies(fetchMock)[1]
    expect(submittedEntry(second, 'length_mm')).toEqual({
      code: 'length_mm', options: [{ option_id: 62, quantity: 1 }],
    })
    expect(submittedEntry(second, 'dimensions_mm')).toEqual({
      code: 'dimensions_mm', dimensions: [307, 130, 46],
    })
    expect(second.remove_characteristics).toBeUndefined()
  })
})

/* ── Category transitions and removal confirmation scope ─────────────────────── */

/** Definitions of the CPU category (id 9): it shares no stored option with the GPU. */
const cpuDefinitionsFixture = {
  category_id: 9,
  category_name: 'Процессоры',
  fields: [
    {
      id: 201, code: 'socket', name: 'Сокет', data_type: 'string', editor: 'select', unit: null,
      sort_order: 0, is_required: true, show_in_short: true, show_in_details: true,
      options: [{ option_id: 71, value: 'AM5' }, { option_id: 72, value: 'LGA1700' }],
      limits: { max_selections: 1, max_quantity: 1, repeatable: false, dimensions: null },
    },
    {
      id: 202, code: 'memory_bus', name: 'Шина памяти', data_type: 'number', editor: 'select',
      unit: 'бит', sort_order: 1, is_required: false, show_in_short: false, show_in_details: true,
      options: [{ option_id: 81, value: '192 бит' }],
      limits: { max_selections: 1, max_quantity: 1, repeatable: false, dimensions: null },
    },
  ],
}

const crossCategoryOptionsFixture = {
  ...productOptionsFixture,
  categories: [
    {
      category: productOptionsFixture.categories[0].category,
      product_types: [
        ...productOptionsFixture.categories[0].product_types,
        { id: 10, category_id: 9, slug: 'desktop', name: 'Desktop' },
      ],
    },
    productOptionsFixture.categories[1],
  ],
}

function setupEditTransition(
  rows: Array<Record<string, unknown>>,
  options: { failFirstPatch?: boolean; optionsPayload?: unknown } = {},
) {
  const detail = { ...productDetailFixture, characteristics: rows }
  let committed = rows
  let patchAttempts = 0
  const fetchMock = stubAdminFetch({
    handler: (url, init) => {
      const method = init.method ?? 'GET'
      if (url.pathname === '/api/v1/admin/product-options') {
        return jsonResponse(options.optionsPayload ?? productOptionsFixture)
      }
      if (url.pathname === '/api/v1/products/filters') {
        return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
      }
      if (url.pathname === '/api/v1/admin/categories/8/characteristics') {
        return jsonResponse(characteristicDefinitionsFixture)
      }
      if (url.pathname === '/api/v1/admin/categories/9/characteristics') {
        return jsonResponse(cpuDefinitionsFixture)
      }
      if (url.pathname === '/api/v1/admin/products/7' && method === 'GET') {
        return jsonResponse({ ...detail, characteristics: committed })
      }
      if (url.pathname === '/api/v1/admin/products/7' && method === 'PATCH') {
        patchAttempts += 1
        if (options.failFirstPatch && patchAttempts === 1) {
          return jsonResponse({ detail: 'Характеристика не подходит категории' }, 422)
        }
        const body = requestBody(init) as PatchBody
        committed = committed.filter(
          (row) => !new Set(body.remove_characteristics ?? []).has(String(row.code)),
        )
        return jsonResponse({ ...detail, characteristics: committed })
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
  return fetchMock
}

const confirmLabel = 'Удалить эти характеристики при смене категории'
const confirmationBox = () => screen.queryByLabelText(confirmLabel) as HTMLInputElement | null
const findConfirmationBox = async () => (await screen.findByLabelText(confirmLabel)) as HTMLInputElement

const selectCategory = async (categoryId: string, typeId: string) => {
  fireEvent.change(screen.getByLabelText('Категория'), { target: { value: categoryId } })
  fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: typeId } })
}

const unresolvedText = /Подтвердите удаление характеристик предыдущей категории/
const clickSubmit = () => {
  fireEvent.click(document.querySelector('form button[type="submit"]') as HTMLButtonElement)
}

describe('admin product category transition', () => {
  it('requires a decision for every stored value because option ids are category-scoped', async () => {
    const fetchMock = setupEditTransition([chipsetRow(), memorySizeRow(), memoryBusRow()])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await selectCategory('9', '10')
    // None of the stored options belongs to a CPU definition, so all three need a
    // replacement or an explicit removal — a matching code is not enough.
    expect(await screen.findByText('Характеристики предыдущей категории: 3')).toBeTruthy()
    pickOption('Сокет', 71)
    clickSubmit()
    expect(await screen.findByText(unresolvedText)).toBeTruthy()
    expect(patchBody(fetchMock)).toBeNull()
  })

  it('accepts a confirmed removal for the current transition only', async () => {
    const fetchMock = setupEditTransition([chipsetRow(), memorySizeRow(), memoryBusRow()])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await selectCategory('9', '10')
    await findConfirmationBox()
    fireEvent.click(await findConfirmationBox())
    pickOption('Сокет', 71)
    clickSubmit()

    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())
    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect([...(body.remove_characteristics ?? [])].sort()).toEqual([
      'chipset', 'memory_bus', 'memory_size',
    ])
    expect(submittedEntry(body, 'socket')).toEqual({
      code: 'socket', options: [{ option_id: 71, quantity: 1 }],
    })
  })

  it('resets the confirmation when the selected category changes', async () => {
    setupEditTransition([chipsetRow(), memorySizeRow(), memoryBusRow()])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    fireEvent.click(await findConfirmationBox())
    expect((confirmationBox() as HTMLInputElement).checked).toBe(true)

    await selectCategory('9', '10')
    expect(await screen.findByText('Характеристики предыдущей категории: 3')).toBeTruthy()
    expect((confirmationBox() as HTMLInputElement).checked).toBe(false)
  })

  it('resets the confirmation when a type selection moves to another category', async () => {
    setupEditTransition([chipsetRow(), memorySizeRow(), memoryBusRow()], {
      optionsPayload: crossCategoryOptionsFixture,
    })
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    fireEvent.click(await findConfirmationBox())
    expect((confirmationBox() as HTMLInputElement).checked).toBe(true)

    fireEvent.change(screen.getByLabelText('Тип товара'), { target: { value: '10' } })
    expect(await screen.findByText('Характеристики предыдущей категории: 3')).toBeTruthy()
    expect((confirmationBox() as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText('Категория') as HTMLSelectElement).value).toBe('9')
  })

  it('keeps the confirmation while unrelated form fields change', async () => {
    const fetchMock = setupEditTransition([chipsetRow(), memorySizeRow(), memoryBusRow()])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await selectCategory('9', '10')
    fireEvent.click(await findConfirmationBox())

    renameProduct()
    fireEvent.change(screen.getByLabelText(/Количество на складе/), { target: { value: '12' } })
    expect((confirmationBox() as HTMLInputElement).checked).toBe(true)

    await screen.findByLabelText('Сокет')
    pickOption('Сокет', 71)
    clickSubmit()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())
    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect([...(body.remove_characteristics ?? [])].sort()).toEqual([
      'chipset', 'memory_bus', 'memory_size',
    ])
  })

  it('does not report a rejected save as saved and keeps the confirmation', async () => {
    const fetchMock = setupEditTransition(
      [chipsetRow(), memorySizeRow(), memoryBusRow()],
      { failFirstPatch: true },
    )
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    await selectCategory('9', '10')
    fireEvent.click(await findConfirmationBox())
    await screen.findByLabelText('Сокет')
    pickOption('Сокет', 71)
    clickSubmit()

    expect(await screen.findByText(/Характеристика не подходит категории/)).toBeTruthy()
    expect(screen.queryByText('Изменения сохранены')).toBeNull()
    expect((confirmationBox() as HTMLInputElement).checked).toBe(true)

    clickSubmit()
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/admin/products/7')
      .filter(([, init]) => init.method === 'PATCH')).toHaveLength(2))
    const attempts = callsTo(fetchMock, '/api/v1/admin/products/7')
      .filter(([, init]) => init.method === 'PATCH')
    expect((requestBody(attempts[1][1]) as PatchBody).remove_characteristics?.slice().sort())
      .toEqual(['chipset', 'memory_bus', 'memory_size'])
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy()
  })

  it('restores numeric values, option ids and all three dimensions on the way back', async () => {
    const fetchMock = setupEditTransition([
      memorySizeRow(),
      memoryBusRow(),
      characteristicRow({
        code: 'length_mm', name: 'Длина', data_type: 'number', editor: 'numeric', unit: 'мм',
        sort_order: 5, is_required: false, value: 305, display_value: '305 мм',
        options: [{ option_id: 62, value: '305 мм', quantity: 1 }],
      }),
      characteristicRow({
        code: 'dimensions_mm', name: 'Габариты', data_type: 'number_list', editor: 'dimensions',
        unit: 'мм', sort_order: 4, is_required: false,
        value: [307, 125, 46], display_value: '307 × 125 × 46 мм',
        options: [{ option_id: 51, value: '307 × 125 × 46 мм', quantity: 1 }],
      }),
    ])
    await screen.findByRole('heading', { name: 'Редактирование товара' })
    const combo = (await screen.findByRole('combobox', { name: 'Длина' })) as HTMLInputElement
    expect(combo.value).toBe('305')
    expect((screen.getByLabelText('Длина, мм') as HTMLInputElement).value).toBe('307')

    // Another category: the GPU controls and their option ids no longer apply.
    await selectCategory('9', '10')
    await screen.findByLabelText('Сокет')
    expect(screen.queryByRole('combobox', { name: 'Длина' })).toBeNull()
    expect(screen.queryByLabelText('Длина, мм')).toBeNull()

    // Back to the original category: the server snapshot restores everything.
    await selectCategory('8', '8')
    const restored = (await screen.findByRole('combobox', { name: 'Длина' })) as HTMLInputElement
    expect(restored.value).toBe('305')
    expect((screen.getByLabelText('Длина, мм') as HTMLInputElement).value).toBe('307')
    expect((screen.getByLabelText('Ширина, мм') as HTMLInputElement).value).toBe('125')
    expect((screen.getByLabelText('Высота, мм') as HTMLInputElement).value).toBe('46')
    // Every stored code is usable again, so no transition decision is required.
    expect(screen.queryByText(/Характеристики предыдущей категории/)).toBeNull()

    await submitForm()
    await waitFor(() => expect(patchBody(fetchMock)).toBeTruthy())
    const body = patchBody(fetchMock)
    if (!body) throw new Error('PATCH body missing')
    expect(submittedEntry(body, 'length_mm')).toEqual({
      code: 'length_mm', options: [{ option_id: 62, quantity: 1 }],
    })
    expect(submittedEntry(body, 'dimensions_mm')).toEqual({
      code: 'dimensions_mm', dimensions: [307, 125, 46],
    })
    expect(body.remove_characteristics).toBeUndefined()
  })
})
