import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { createTestQueryClient, render } from '../test-utils'
import { useAccountStore } from '../stores/accountStore'
import { SavesPage } from './SavesPage'

vi.mock('../components/Header', () => ({ Header: () => <header data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div /> }))
const data = { id: 42, user_id: 7, name: 'Private build', description: '', version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', items: [] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const signedIn = () => useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
beforeEach(() => { useAccountStore.setState({ accounts: {}, activeAccountId: null }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('private saved builds', () => {
  it('does not fetch private builds for a guest', () => {
    const mock = vi.fn(); vi.stubGlobal('fetch', mock)
    render(<MemoryRouter><SavesPage /></MemoryRouter>)
    expect(screen.getByText('Мои сборки')).toBeTruthy()
    expect(mock).not.toHaveBeenCalled()
  })
  it('disables cart for unknown compatibility and deletes only after confirmation', async () => {
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    let deleted = false
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/compatibility')) return json({ build_id: 42, overall_status: 'unknown', items: [] })
      if (url.endsWith('/42') && init.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }) }
      return json(deleted ? [] : [data])
    })
    vi.stubGlobal('fetch', mock)
    render(<MemoryRouter><SavesPage /></MemoryRouter>)
    await screen.findByText('Private build')
    await waitFor(() => expect((screen.getByRole('button', { name: /В корзину/i }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /Удалить.*Private build/i }))
    const dialog = screen.getByRole('alertdialog')
    expect(deleted).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: /Удалить/i }))
    await waitFor(() => expect(deleted).toBe(true))
    await waitFor(() => expect(screen.queryByText('Private build')).toBeNull())
  })
})

describe('saved builds page-critical errors', () => {
  it.each([403, 404, 429, 500, 503])('replaces the saved builds page with the fullscreen %i page', async (status) => {
    signedIn()
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'boom' }, status)))
    render(<MemoryRouter><SavesPage /></MemoryRouter>)

    expect(await screen.findByText(String(status))).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Приносим извинения')
    expect(screen.queryByTestId('header')).toBeNull()
    expect(screen.queryByTestId('footer')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Мои сборки' })).toBeNull()
  })

  it('keeps an empty successful list as a valid state', async () => {
    signedIn()
    vi.stubGlobal('fetch', vi.fn(async () => json([])))
    render(<MemoryRouter><SavesPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Сборок пока нет' })).toBeTruthy()
    expect(screen.getByTestId('header')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps the saved builds when a background refetch fails', async () => {
    signedIn()
    let failing = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/compatibility')) return json({ build_id: 42, overall_status: 'compatible', items: [] })
      return failing ? json({ detail: 'boom' }, 503) : json([data])
    }))
    const client = createTestQueryClient()
    render(<MemoryRouter><SavesPage /></MemoryRouter>, { client })
    await screen.findByText('Private build')

    failing = true
    await act(async () => { await client.invalidateQueries() })

    expect(screen.getByText('Private build')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps a status outside the approved list local', async () => {
    signedIn()
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'unauthorized' }, 401)))
    render(<MemoryRouter><SavesPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })
})
