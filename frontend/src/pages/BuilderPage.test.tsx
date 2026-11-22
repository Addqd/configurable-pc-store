import { getProductsForCategory } from '../test-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { createTestQueryClient, render } from '../test-utils'
import { BuilderPage } from './BuilderPage'
import { useBuilderStore, emptyBuilderSelections } from '../stores/builderStore'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div /> }))
vi.mock('../components/BuilderComponentRow', () => ({ BuilderComponentRow: () => <div /> }))
vi.mock('../components/BuilderSidebar', () => ({
  BuilderSidebar: ({ status, loading = false, error = false }: { status: string; loading?: boolean; error?: boolean }) => (
    <div>
      <div data-testid="compatibility-status">{status}</div>
      <div data-testid="compatibility-loading">{String(loading)}</div>
      <div data-testid="compatibility-error">{String(error)}</div>
    </div>
  ),
}))
vi.mock('../components/BuilderSpecsTable', () => ({ BuilderSpecsTable: () => <div /> }))
beforeEach(() => {
  useBuilderStore.setState({ selections: emptyBuilderSelections(), editingBuildId: null })
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useUIStore.setState({ authModalOpen: false })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const savedBuild = (id: number, name: string, productId: number) => ({
  id, user_id: 7, name, description: '', version: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  items: [{ slot: 'cpu', product_id: productId, product_name: 'CPU', product_slug: 'cpu', price: '100.00' }],
})
const signedIn = () => useAccountStore.setState({
  activeAccountId: '7',
  accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } },
})
const compatibility = (status: string) => jsonResponse({ build_id: 0, overall_status: status, items: [] })

describe('saving a server build', () => {
  it('requires authentication and preserves the draft', () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.getState().setProduct('cpu', product)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    expect(useUIStore.getState().authModalOpen).toBe(true)
    expect(useBuilderStore.getState().selections.cpu?.id).toBe(product.id)
  })
  it('posts selected server IDs and reports success only after a valid response', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.getState().setProduct('cpu', product)
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/builds' && init.method === 'POST') return new Response(JSON.stringify({ id: 42, user_id: 7, name: 'My build', description: '', version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', items: [] }), { status: 201, headers: { 'Content-Type': 'application/json' } })
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'My build' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/v1/builds' && init.method === 'POST')!
    expect(JSON.parse(String(post[1].body)).items).toEqual([{ slot: 'cpu', product_id: product.id }])
    expect(useBuilderStore.getState().editingBuildId).toBe(42)
    expect(screen.getByText(/сохранена/i)).toBeTruthy()
    act(() => useBuilderStore.getState().setProduct('cpu', getProductsForCategory('cpu')[1]))
    expect(screen.queryByText(/сохранена/i)).toBeNull()
  })

  it('saves an existing build name and selected parts in one request', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: product }, editingBuildId: 42 })
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    const build = savedBuild(42, 'Old name', product.id)
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      if (url === '/api/v1/builds/42') return jsonResponse(build)
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    // The name of the saved build is only known after its request settles.
    const saveButton = screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement
    await waitFor(() => expect(saveButton.disabled).toBe(false))
    fireEvent.click(saveButton)
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Updated name' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const writes = fetchMock.mock.calls.filter(([url, init]) => url !== '/api/v1/builds/compatibility' && (init.method === 'PUT' || init.method === 'POST'))
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toBe('/api/v1/builds/42')
    expect(JSON.parse(String(writes[0][1].body))).toMatchObject({ name: 'Updated name', items: [{ slot: 'cpu', product_id: product.id }] })
  })

  it('checks an unsaved selection through the server', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.getState().setProduct('cpu', product)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ build_id: 0, overall_status: 'unknown', items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find(([url]: unknown[]) => url === '/api/v1/builds/compatibility') as unknown as [string, RequestInit]
    expect(JSON.parse(String(call[1].body))).toEqual({ items: [{ slot: 'cpu', product_id: product.id }] })
  })

  it('does not display an older compatibility response after selection changes', async () => {
    const [first, second] = getProductsForCategory('cpu')
    useBuilderStore.getState().setProduct('cpu', first)
    let resolveFirst!: (response: Response) => void
    const response = (status: string) => new Response(JSON.stringify({ build_id: 0, overall_status: status, items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const id = JSON.parse(String(init.body)).items[0].product_id
      if (id === first.id) return new Promise<Response>(resolve => { resolveFirst = resolve })
      return response('incompatible')
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => useBuilderStore.getState().setProduct('cpu', second))
    await waitFor(() => expect(screen.getByTestId('compatibility-status').textContent).toBe('incompatible'))
    await act(async () => { resolveFirst(response('compatible')) })
    expect(screen.getByTestId('compatibility-status').textContent).toBe('incompatible')
  })
})

describe('compatibility query freshness', () => {
  it('shows the skeleton only while the current selection has no verdict yet', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.getState().setProduct('cpu', product)
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('compatibility-loading').textContent).toBe('true'))
    expect(screen.getByTestId('compatibility-status').textContent).toBe('unknown')
  })

  it('keeps the verdict visible during a background refetch of the same selection', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.getState().setProduct('cpu', product)
    const client = createTestQueryClient()
    let pending = false
    const fetchMock = vi.fn(async () => pending ? new Promise<Response>(() => {}) : compatibility('compatible'))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>, { client })

    await waitFor(() => expect(screen.getByTestId('compatibility-status').textContent).toBe('compatible'))
    pending = true
    await act(async () => { void client.refetchQueries({ queryKey: ['current-compatibility', [{ slot: 'cpu', product_id: product.id }]] }) })

    expect(screen.getByTestId('compatibility-loading').textContent).toBe('false')
    expect(screen.getByTestId('compatibility-status').textContent).toBe('compatible')
  })

  it('reports a failed check without a stale verdict and recovers on a new selection', async () => {
    const [first, second] = getProductsForCategory('cpu')
    useBuilderStore.getState().setProduct('cpu', first)
    let failing = true
    vi.stubGlobal('fetch', vi.fn(async () => failing
      ? new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      : compatibility('compatible')))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByTestId('compatibility-error').textContent).toBe('true'))
    expect(screen.getByTestId('compatibility-status').textContent).toBe('unknown')
    expect(screen.getByTestId('compatibility-loading').textContent).toBe('false')

    failing = false
    act(() => useBuilderStore.getState().setProduct('cpu', second))

    await waitFor(() => expect(screen.getByTestId('compatibility-status').textContent).toBe('compatible'))
    expect(screen.getByTestId('compatibility-error').textContent).toBe('false')
  })
})

describe('loading an existing saved build', () => {
  it('shows a saved-build placeholder and blocks actions until the build arrives', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: product }, editingBuildId: 42 })
    signedIn()
    let resolveBuild!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/v1/builds/42'
      ? new Promise<Response>(resolve => { resolveBuild = resolve })
      : new Response(null, { status: 404 })))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)

    expect(await screen.findByTestId('builder-saved-build-skeleton')).toBeTruthy()
    expect((screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement).disabled).toBe(true)
    // The restored configuration is shown while the saved build is still loading.
    expect(useBuilderStore.getState().selections.cpu?.id).toBe(product.id)

    await waitFor(() => expect(resolveBuild).toBeDefined())
    await act(async () => { resolveBuild(jsonResponse(savedBuild(42, 'Моя сборка', product.id))) })

    await waitFor(() => expect(screen.queryByTestId('builder-saved-build-skeleton')).toBeNull())
    expect(useBuilderStore.getState().selections.cpu?.id).toBe(product.id)
    await waitFor(() => expect((screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement).disabled).toBe(false))
  })

  it('reports a missing saved build instead of waiting forever', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: product }, editingBuildId: 42 })
    signedIn()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/v1/builds/42'
      ? new Response(JSON.stringify({ detail: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 404 })))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)

    const notice = await screen.findByText(/Сохранённая сборка не найдена/)
    expect(notice).toBeTruthy()
    expect(screen.queryByTestId('builder-saved-build-skeleton')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
    expect(useBuilderStore.getState().selections.cpu?.id).toBe(product.id)
  })

  it('offers a retry after a transient failure and clears the notice once the build loads', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.setState({ selections: { ...emptyBuilderSelections(), cpu: product }, editingBuildId: 42 })
    signedIn()
    let failing = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url !== '/api/v1/builds/42') return new Response(null, { status: 404 })
      return failing
        ? new Response(JSON.stringify({ detail: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        : jsonResponse(savedBuild(42, 'Моя сборка', product.id))
    }))
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)

    const notice = await screen.findByText('Не удалось загрузить данные. Попробуйте ещё раз.')
    expect(notice).toBeTruthy()
    expect(screen.queryByTestId('builder-saved-build-skeleton')).toBeNull()

    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(screen.queryByText('Не удалось загрузить данные. Попробуйте ещё раз.')).toBeNull())
    expect(useBuilderStore.getState().selections.cpu?.id).toBe(product.id)
  })

  it('does not request a saved build when a new configuration is started', async () => {
    const product = getProductsForCategory('cpu')[0]
    useBuilderStore.getState().setProduct('cpu', product)
    signedIn()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => compatibility('unknown'))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls.some(([url]) => /^\/api\/v1\/builds\/\d+$/.test(String(url)))).toBe(false)
    expect(screen.queryByTestId('builder-saved-build-skeleton')).toBeNull()
  })
})
