import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '../test-utils'
import { AdminGate } from './access'
import { useAccountStore } from '../stores/accountStore'
import { jsonResponse, ownerFixture, stubAdminFetch } from '../test-admin-api'

vi.mock('../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

const account = {
  id: '1', email: ownerFixture.email, username: ownerFixture.username,
  displayName: ownerFixture.display_name, avatar: '', createdAt: 0,
}

function DraftProbe() {
  const [value, setValue] = useState('')
  return (
    <div>
      <p>ADMIN CONTENT</p>
      <input aria-label="draft" value={value} onChange={(event) => setValue(event.target.value)} />
    </div>
  )
}

const adminPayload = { ...ownerFixture, counters: { orders: 1, reviews: 2, favorites: 3, saved_builds: 4 } }

function setupWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminGate />}>
            <Route index element={<DraftProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

function setup() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminGate />}>
          <Route index element={<div>ADMIN CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin access gate', () => {
  it('shows the sign-in requirement for guests without calling the admin API', async () => {
    const fetchMock = stubAdminFetch({ handler: () => undefined })
    setup()
    expect(await screen.findByText('Требуется вход')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy()
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/admin/users/')),
    ).toBe(false)
  })

  it('authorizes an admin/owner through the protected endpoint', async () => {
    useAccountStore.setState({ accounts: { '1': { account } }, activeAccountId: '1' })
    const fetchMock = stubAdminFetch({
      handler: (url) => url.pathname === '/api/v1/admin/users/1'
        ? jsonResponse({ ...ownerFixture, counters: { orders: 1, reviews: 2, favorites: 3, saved_builds: 4 } })
        : undefined,
    })
    setup()
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/v1/admin/users/1')).toBe(true)
  })

  it('renders a forbidden state when the protected endpoint answers 403', async () => {
    useAccountStore.setState({ accounts: { '1': { account } }, activeAccountId: '1' })
    stubAdminFetch({
      handler: (url) => url.pathname === '/api/v1/admin/users/1'
        ? jsonResponse({ detail: 'Administrator access required' }, 403)
        : undefined,
    })
    setup()
    expect(await screen.findByText('Доступ запрещён')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Вернуться в магазин' })).toBeTruthy()
    expect(screen.queryByText('ADMIN CONTENT')).toBeNull()
  })

  it('offers a retry instead of granting access on a server failure', async () => {
    useAccountStore.setState({ accounts: { '1': { account } }, activeAccountId: '1' })
    stubAdminFetch({
      handler: (url) => url.pathname === '/api/v1/admin/users/1'
        ? jsonResponse({ detail: 'boom' }, 500)
        : undefined,
    })
    setup()
    expect(await screen.findByText('Не удалось проверить права доступа.')).toBeTruthy()
    expect(screen.queryByText('ADMIN CONTENT')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy())
  })

  it('keeps the mounted admin page and its unsaved edits when a background refetch fails', async () => {
    useAccountStore.setState({ accounts: { '1': { account } }, activeAccountId: '1' })
    let failing = false
    stubAdminFetch({
      handler: (url) => url.pathname === '/api/v1/admin/users/1'
        ? (failing ? jsonResponse({ detail: 'boom' }, 500) : jsonResponse(adminPayload))
        : undefined,
    })
    const client = setupWithClient()
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy()

    const draft = screen.getByLabelText('draft')
    fireEvent.change(draft, { target: { value: 'несохранённый товар' } })

    failing = true
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['/api/v1/admin/users/1'] })
    })

    expect(screen.getByText('ADMIN CONTENT')).toBeTruthy()
    expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('несохранённый товар')
    expect(screen.queryByText('Не удалось проверить права доступа.')).toBeNull()
  })

  it('still denies access when a background refetch reports 403', async () => {
    useAccountStore.setState({ accounts: { '1': { account } }, activeAccountId: '1' })
    let failing = false
    stubAdminFetch({
      handler: (url) => url.pathname === '/api/v1/admin/users/1'
        ? (failing
            ? jsonResponse({ detail: 'Administrator access required' }, 403)
            : jsonResponse(adminPayload))
        : undefined,
    })
    const client = setupWithClient()
    expect(await screen.findByText('ADMIN CONTENT')).toBeTruthy()

    failing = true
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['/api/v1/admin/users/1'] })
    })

    expect(await screen.findByText('Доступ запрещён')).toBeTruthy()
    expect(screen.queryByText('ADMIN CONTENT')).toBeNull()
  })
})
