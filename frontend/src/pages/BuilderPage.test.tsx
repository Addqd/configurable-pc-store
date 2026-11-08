import { getProductsForCategory } from '../test-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '../test-utils'
import { BuilderPage } from './BuilderPage'
import { useBuilderStore, emptyBuilderSelections } from '../stores/builderStore'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div /> }))
vi.mock('../components/BuilderComponentRow', () => ({ BuilderComponentRow: () => <div /> }))
vi.mock('../components/BuilderSidebar', () => ({ BuilderSidebar: () => <div /> }))
vi.mock('../components/BuilderSpecsTable', () => ({ BuilderSpecsTable: () => <div /> }))
beforeEach(() => {
  useBuilderStore.setState({ selections: emptyBuilderSelections(), editingBuildId: null })
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useUIStore.setState({ authModalOpen: false })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    const build = { id: 42, user_id: 7, name: 'Old name', description: '', version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', items: [] }
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      if (url === '/api/v1/builds/42') return new Response(JSON.stringify(build), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Updated name' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сохранить сборку' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const writes = fetchMock.mock.calls.filter(([, init]) => init.method === 'PUT' || init.method === 'POST')
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toBe('/api/v1/builds/42')
    expect(JSON.parse(String(writes[0][1].body))).toMatchObject({ name: 'Updated name', items: [{ slot: 'cpu', product_id: product.id }] })
  })
})
