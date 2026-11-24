import { getProductsForCategory } from '../test-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '../test-utils'
import { BuilderPage } from './BuilderPage'
import { useBuilderStore, emptyBuilderSelections, type BuilderSelections } from '../stores/builderStore'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { i18n } from '../i18n'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div /> }))
vi.mock('../components/BuilderComponentRow', () => ({ BuilderComponentRow: () => <div /> }))
vi.mock('../components/BuilderSpecsTable', () => ({ BuilderSpecsTable: () => <div /> }))

beforeEach(() => {
  useBuilderStore.getState().startNewBuild()
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useUIStore.setState({ authModalOpen: false })
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await act(async () => { await i18n.changeLanguage('ru') })
})

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const complete = (): BuilderSelections => ({
  cpu: getProductsForCategory('cpu')[0],
  mobo: getProductsForCategory('mobo')[0],
  gpu: getProductsForCategory('gpu')[0],
  ram: getProductsForCategory('ram')[0],
  storage: getProductsForCategory('storage')[0],
  psu: getProductsForCategory('psu')[0],
  case: getProductsForCategory('case')[0],
  cooling: getProductsForCategory('cooling')[0],
})
const selectAll = () => act(() => useBuilderStore.setState({ selections: complete() }))
const createButton = (name: RegExp = /Создать сборку/i) => screen.getByRole('button', { name }) as HTMLButtonElement
const cartButton = () => screen.getByRole('button', { name: /Добавить сборку в корзину/i }) as HTMLButtonElement

const socketConflict = {
  build_id: 0,
  overall_status: 'incompatible',
  items: [
    {
      product_id: 0, product_name: '', slot: 'cpu+mobo_socket', status: 'incompatible',
      message: 'cpu.socket must equal mobo.socket',
      details: [
        { slot: 'cpu', product_id: 11, product_name: 'AMD Ryzen 5 7600X', code: 'socket', name: 'Сокет', data_type: 'string', unit: null, value: 'am5', display_value: 'am5' },
        { slot: 'mobo', product_id: 22, product_name: 'ASRock B650M Pro RS', code: 'socket', name: 'Сокет', data_type: 'string', unit: null, value: 'lga1700', display_value: 'lga1700' },
      ],
    },
  ],
}
const verdict = (status: 'compatible' | 'incompatible' | 'unknown', items: unknown[] = []) =>
  jsonResponse({ build_id: 0, overall_status: status, items })

/** Answers only the explicit compatibility endpoint; every other call fails loudly. */
function stubCompatibility(answer: (body: { items: { slot: string; product_id: number }[] }) => Promise<Response> | Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/v1/builds/compatibility') return answer(JSON.parse(String(init.body)))
    if (url.startsWith('/api/v1/builds/')) return jsonResponse({ detail: 'Not found' }, 404)
    return jsonResponse({ detail: 'unexpected request' }, 500)
  })
}

describe('explicit compatibility check', () => {
  it('never requests compatibility on mount or when components are selected', async () => {
    const fetchMock = stubCompatibility(() => verdict('compatible'))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    await act(async () => { await Promise.resolve() })
    selectAll()
    await act(async () => { await Promise.resolve() })
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/builds/compatibility')).toHaveLength(0)
    expect(screen.getByText('Не проверена')).toBeTruthy()
    expect(cartButton().disabled).toBe(true)
  })

  it('keeps Create disabled until all eight components are selected', () => {
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('compatible')))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    expect(createButton().disabled).toBe(true)
    act(() => useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: getProductsForCategory('cpu')[0] } }))
    expect(createButton().disabled).toBe(true)
    expect(document.getElementById('builder-create-validation')?.textContent).toMatch(/Выберите комплектующие/i)
  })

  it('enables Create for eight selections before any verification and sends one request per action', async () => {
    let release!: (response: Response) => void
    const fetchMock = stubCompatibility(() => new Promise<Response>(resolve => { release = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    expect(createButton().disabled).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(createButton())
    await waitFor(() => expect(screen.getByTestId('builder-compatibility-skeleton')).toBeTruthy())
    // While the check is pending a second submission is rejected.
    expect(createButton().disabled).toBe(true)
    fireEvent.click(createButton())
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/builds/compatibility')).toHaveLength(1)

    await act(async () => { release(verdict('compatible')) })
    await waitFor(() => expect(screen.getByText('Всё совместимо')).toBeTruthy())
    expect(cartButton().disabled).toBe(false)
    expect(screen.getByText(/Сборка готова/i)).toBeTruthy()
  })

  it('opens a detailed conflict modal and a red notification for incompatibilities', async () => {
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('incompatible', socketConflict.items)))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Обнаружены несовместимости')).toBeTruthy()
    // Component categories, selected product names and the compared values.
    expect(within(dialog).getByText('Процессор')).toBeTruthy()
    expect(within(dialog).getByText('Материнская плата')).toBeTruthy()
    expect(within(dialog).getByText('AMD Ryzen 5 7600X')).toBeTruthy()
    expect(within(dialog).getByText('ASRock B650M Pro RS')).toBeTruthy()
    expect(within(dialog).getAllByText(/Сокет:/)).toHaveLength(2)
    expect(within(dialog).getByText('am5')).toBeTruthy()
    expect(within(dialog).getByText('lga1700')).toBeTruthy()
    expect(within(dialog).getByText('Сокет процессора должен совпадать с сокетом материнской платы.')).toBeTruthy()

    // The modal can be closed while the notification and the blocked cart stay.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Понятно' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText(/Найдены несовместимости: 1/i)).toBeTruthy()
    expect(cartButton().disabled).toBe(true)
  })

  it('describes unknown verification as missing data, not as a conflict', async () => {
    const unknown = [{
      product_id: 0, product_name: '', slot: 'cpu+cooling_socket', status: 'unknown', message: 'cpu.socket must be listed in cooling.supported_sockets',
      details: [
        { slot: 'cpu', product_id: 11, product_name: 'AMD Ryzen 5 7600X', code: 'socket', name: 'Сокет', data_type: 'string', unit: null, value: 'am5', display_value: 'am5' },
        { slot: 'cooling', product_id: 33, product_name: 'DeepCool AK620', code: 'supported_sockets', name: 'Совместимые сокеты', data_type: 'string_list', unit: null, value: null, display_value: null },
      ],
    }]
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('unknown', unknown)))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())

    await screen.findByText(/Недостаточно данных для проверки: 1/i)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Недостаточно данных')).toBeTruthy()
    expect(cartButton().disabled).toBe(true)
  })

  it('reports a failed request and allows retrying through Create', async () => {
    let failing = true
    vi.stubGlobal('fetch', stubCompatibility(() => failing ? Promise.resolve(jsonResponse({ detail: 'boom' }, 500)) : verdict('compatible')))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())

    await screen.findByText(/Не удалось проверить совместимость/i)
    expect(cartButton().disabled).toBe(true)

    failing = false
    fireEvent.click(createButton())
    await waitFor(() => expect(screen.getByText('Всё совместимо')).toBeTruthy())
    expect(cartButton().disabled).toBe(false)
  })

  it('invalidates the verdict on any component change and never restores it', async () => {
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('compatible')))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    const [first, second] = getProductsForCategory('cpu')
    act(() => useBuilderStore.getState().setProduct('cpu', first))
    fireEvent.click(createButton())
    await waitFor(() => expect(cartButton().disabled).toBe(false))

    act(() => useBuilderStore.getState().setProduct('cpu', second))
    expect(cartButton().disabled).toBe(true)
    expect(screen.getByText('Не проверена')).toBeTruthy()

    // Switching back to the previously verified part does not restore its verdict.
    act(() => useBuilderStore.getState().setProduct('cpu', first))
    expect(cartButton().disabled).toBe(true)
    expect(screen.getByText('Не проверена')).toBeTruthy()
  })

  it('ignores a response that arrives after the selections changed', async () => {
    let release!: (response: Response) => void
    vi.stubGlobal('fetch', stubCompatibility(() => new Promise<Response>(resolve => { release = resolve })))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())
    await waitFor(() => expect(screen.getByTestId('builder-compatibility-skeleton')).toBeTruthy())

    act(() => useBuilderStore.getState().setProduct('cpu', getProductsForCategory('cpu')[1]))
    await act(async () => { release(verdict('compatible')) })

    expect(screen.queryByText('Всё совместимо')).toBeNull()
    expect(cartButton().disabled).toBe(true)
    expect(screen.getByText('Не проверена')).toBeTruthy()
  })
})

describe('cart integration', () => {
  it('adds a verified configuration to the cart without saving it first', async () => {
    signedIn()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/builds/compatibility') return verdict('compatible')
      if (url === '/api/v1/cart/builds' && init.method === 'POST') {
        return jsonResponse({ id: 1, items: [], subtotal: '0.00', item_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
      }
      return jsonResponse({ detail: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())
    await waitFor(() => expect(cartButton().disabled).toBe(false))
    fireEvent.click(cartButton())

    await screen.findByText(/Сборка добавлена в корзину/i)
    const cartPost = fetchMock.mock.calls.find(([url]) => url === '/api/v1/cart/builds')!
    const body = JSON.parse(String(cartPost[1].body))
    expect(body.saved_build_id).toBeUndefined()
    expect(body.items).toHaveLength(8)
    expect(body.quantity).toBe(1)
    // No saved-build record was created by the purchase.
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/v1/builds' && init.method === 'POST')).toBe(false)
  })

  it('requires authentication before adding a verified build to the cart', async () => {
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('compatible')))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())
    await waitFor(() => expect(cartButton().disabled).toBe(false))
    fireEvent.click(cartButton())
    expect(useUIStore.getState().authModalOpen).toBe(true)
  })

  it('reports a rejected cart addition without enabling a second purchase', async () => {
    signedIn()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/v1/builds/compatibility'
      ? verdict('compatible')
      : jsonResponse({ detail: 'Insufficient product stock' }, 422)))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())
    await waitFor(() => expect(cartButton().disabled).toBe(false))
    fireEvent.click(cartButton())
    await screen.findByText(/Не удалось добавить сборку в корзину/i)
    expect(screen.queryByText(/Сборка добавлена в корзину/i)).toBeNull()
  })
})

describe('saving is independent of compatibility', () => {
  const savedBody = { id: 42, user_id: 7, name: 'My build', description: '', version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', items: [] }

  it('saves an incomplete, unchecked configuration without checking it', async () => {
    signedIn()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/builds' && init.method === 'POST') return jsonResponse(savedBody, 201)
      return jsonResponse({ detail: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    act(() => useBuilderStore.getState().setProduct('cpu', getProductsForCategory('cpu')[0]))
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'My build' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/v1/builds' && init.method === 'POST')!
    expect(JSON.parse(String(post[1].body)).items).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/builds/compatibility')).toBe(false)
    expect(useBuilderStore.getState().editingBuildId).toBe(42)
    expect(screen.getByText(/сохранена/i)).toBeTruthy()
  })

  it('saves an incompatible configuration without being blocked by the verdict', async () => {
    signedIn()
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/builds/compatibility') return verdict('incompatible', socketConflict.items)
      if (url === '/api/v1/builds' && init.method === 'POST') return jsonResponse(savedBody, 201)
      return jsonResponse({ detail: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())
    await screen.findByRole('alertdialog')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Понятно' }))

    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/v1/builds' && init.method === 'POST')).toBe(true))
  })

  it('updates the existing saved build instead of creating another record', async () => {
    signedIn()
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: product }, editingBuildId: 42 })
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/builds/42' && (init.method ?? 'GET') === 'GET') {
        return jsonResponse({ ...savedBody, name: 'Old name', items: [{ slot: 'cpu', product_id: product.id, product_name: 'CPU', product_slug: 'cpu', price: '100.00' }] })
      }
      if (url === '/api/v1/builds/42' && init.method === 'PUT') return jsonResponse(savedBody)
      return jsonResponse({ detail: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    const saveButton = screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement
    await waitFor(() => expect(saveButton.disabled).toBe(false))
    fireEvent.click(saveButton)
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Updated name' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const writes = fetchMock.mock.calls.filter(([, init]) => init.method === 'PUT' || init.method === 'POST')
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toBe('/api/v1/builds/42')
    expect(JSON.parse(String(writes[0][1].body))).toMatchObject({ name: 'Updated name', items: [{ slot: 'cpu', product_id: product.id }] })
  })

  it('shows the localized limit error when the fifth saved build is already reached', async () => {
    signedIn()
    useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: getProductsForCategory('cpu')[0] } })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => url === '/api/v1/builds' && init.method === 'POST'
      ? jsonResponse({ detail: 'Saved build limit of 5 reached' }, 409)
      : jsonResponse({ detail: 'unexpected request' }, 500)))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))
    await screen.findByText(/Достигнут лимит сохранённых сборок \(5\)/i)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('clearing the configurator', () => {
  it('removes selections, the verdict and every notice', async () => {
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('compatible')))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton())
    await waitFor(() => expect(cartButton().disabled).toBe(false))

    fireEvent.click(screen.getByRole('button', { name: /^Очистить$/i }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Очистить/i }))

    expect(useBuilderStore.getState().selections.cpu).toBeNull()
    expect(useBuilderStore.getState().verification).toBeNull()
    expect(screen.queryByText(/Сборка готова/i)).toBeNull()
    expect(screen.getByText('Не проверена')).toBeTruthy()
    expect(cartButton().disabled).toBe(true)
    expect(createButton().disabled).toBe(true)
  })
})

describe('english interface', () => {
  it('localizes the conflict modal without using server English text', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    vi.stubGlobal('fetch', stubCompatibility(() => verdict('incompatible', socketConflict.items)))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    selectAll()
    fireEvent.click(createButton(/Create build/i))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Incompatible components')).toBeTruthy()
    expect(within(dialog).getByText('Processor')).toBeTruthy()
    expect(within(dialog).getByText('Motherboard')).toBeTruthy()
    expect(within(dialog).getAllByText(/Socket:/)).toHaveLength(2)
    expect(within(dialog).getByText('The CPU socket must match the motherboard socket.')).toBeTruthy()
    expect(within(dialog).queryByText('cpu.socket must equal mobo.socket')).toBeNull()
  })
})

function signedIn() {
  useAccountStore.setState({
    activeAccountId: '7',
    accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } },
  })
}
