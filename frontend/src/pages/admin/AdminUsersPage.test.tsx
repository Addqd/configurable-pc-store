import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render } from '../../test-utils'
import { AdminGate } from '../../admin/access'
import { AdminUsersPage } from './AdminUsersPage'
import { useAccountStore } from '../../stores/accountStore'
import {
  adminUserFixture, blockedUserFixture, callsTo, jsonResponse, noContent, ownerFixture,
  requestBody, stubAdminFetch, userFixture,
} from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

function accountFor(user: typeof ownerFixture) {
  return {
    id: String(user.id), email: user.email, username: user.username,
    displayName: user.display_name, avatar: '', createdAt: 0,
  }
}

function setup(current: typeof ownerFixture) {
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === `/api/v1/admin/users/${current.id}` && method === 'GET') {
      return jsonResponse({ ...current, counters: { orders: 1, reviews: 2, favorites: 3, saved_builds: 4 } })
    }
    if (url.pathname === '/api/v1/admin/users' && method === 'GET') {
      const status = url.searchParams.get('status')
      const size = Number(url.searchParams.get('page_size') ?? 10)
      if (size === 1 && status === 'active') return jsonResponse({ items: [], total: 2, page: 1, page_size: 1, total_pages: 2 })
      if (size === 1 && status === 'blocked') return jsonResponse({ items: [], total: 1, page: 1, page_size: 1, total_pages: 1 })
      return jsonResponse({
        items: [ownerFixture, adminUserFixture, userFixture, blockedUserFixture],
        total: 4, page: 1, page_size: size, total_pages: 1,
      })
    }
    if (url.pathname === '/api/v1/admin/users/104' && method === 'PATCH') {
      const body = requestBody(init) as Record<string, unknown>
      return jsonResponse({ ...userFixture, ...body })
    }
    if (url.pathname === '/api/v1/admin/users/104' && method === 'DELETE') return noContent()
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  useAccountStore.setState({ accounts: { [String(current.id)]: { account: accountFor(current) } }, activeAccountId: String(current.id) })
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/admin/users" element={<AdminGate />}>
          <Route index element={<AdminUsersPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

beforeEach(() => {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin users page', () => {
  it('renders the user table, counters and permission boundaries for the owner', async () => {
    setup(ownerFixture)
    expect(await screen.findByText('Иван')).toBeTruthy()
    expect(screen.getByText('Всего:').parentElement?.textContent).toContain('4')
    await waitFor(() => expect(screen.getByText('Активных:').parentElement?.textContent).toContain('2'))
    expect(screen.getByText('Заблокированных:').parentElement?.textContent).toContain('1')

    const ownerRow = screen.getByText('Александр').closest('tr') as HTMLElement
    expect((within(ownerRow).getByRole('button', { name: 'Изменить' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(ownerRow).queryByRole('button', { name: 'Удалить' })).toBeNull()

    const adminRow = screen.getByText('Мария').closest('tr') as HTMLElement
    expect((within(adminRow).getByRole('button', { name: 'Изменить' }) as HTMLButtonElement).disabled).toBe(false)
    expect(within(adminRow).queryByRole('button', { name: 'Удалить' })).toBeNull()

    const userRow = screen.getByText('Иван').closest('tr') as HTMLElement
    expect(within(userRow).getByRole('button', { name: 'Удалить' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'В магазин' }).getAttribute('href')).toBe('/')
  })

  it('validates the blocking reason and updates the user', async () => {
    const fetchMock = setup(ownerFixture)
    await screen.findByText('Иван')
    const row = screen.getByText('Иван').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Изменить' }))

    expect(screen.getByRole('heading', { name: 'Изменение пользователя' })).toBeTruthy()
    expect(screen.getByText(/ivan@example\.test · ID 104/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Статус аккаунта'), { target: { value: 'blocked' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByText('Укажите причину блокировки')).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/users/104').some(([, init]) => init.method === 'PATCH')).toBe(false)

    fireEvent.change(screen.getByLabelText('Причина изменения'), { target: { value: 'Спам' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByText('Изменения пользователя сохранены')).toBeTruthy()
    const patch = callsTo(fetchMock, '/api/v1/admin/users/104').find(([, init]) => init.method === 'PATCH')
    expect(requestBody(patch?.[1] ?? {})).toEqual({ status: 'blocked', blocked_reason: 'Спам' })
  })

  it('deletes an ordinary user only through the shared confirmation modal', async () => {
    const fetchMock = setup(ownerFixture)
    await screen.findByText('Иван')
    const row = screen.getByText('Иван').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Удалить' }))

    expect(screen.getByRole('heading', { name: 'Удалить пользователя?' })).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Иван')).toBeTruthy()
    expect(within(dialog).getByText(/ID 104/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/users/104').some(([, init]) => init.method === 'DELETE')).toBe(false)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить навсегда' }))
    expect(await screen.findByText('Пользователь удалён')).toBeTruthy()
    const deletion = callsTo(fetchMock, '/api/v1/admin/users/104').find(([, init]) => init.method === 'DELETE')
    expect(requestBody(deletion?.[1] ?? {})).toEqual({ confirm: true })
  })

  it('keeps role management owner-only for an administrator session', async () => {
    setup(adminUserFixture)
    expect(await screen.findByText('Иван')).toBeTruthy()
    const ownerRow = screen.getByText('Александр').closest('tr') as HTMLElement
    expect((within(ownerRow).getByRole('button', { name: 'Изменить' }) as HTMLButtonElement).disabled).toBe(true)

    const adminRow = screen.getByText('Мария').closest('tr') as HTMLElement
    expect((within(adminRow).getByRole('button', { name: 'Изменить' }) as HTMLButtonElement).disabled).toBe(true)

    const row = screen.getByText('Иван').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Изменить' }))
    expect((screen.getByLabelText('Роль пользователя') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('Только владелец может изменять роли.')).toBeTruthy()
  })
})
