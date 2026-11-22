import { render } from '../test-utils'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AccountPage } from './AccountPage'
import { useAccountStore } from '../stores/accountStore'
import { useCartStore } from '../stores/cartStore'

vi.mock('../components/Header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div data-testid="footer" /> }))

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.cookie = 'csrf_token=; Max-Age=0; path=/' })
beforeEach(() => {
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useCartStore.setState({ activeAccountId: null, items: [], orders: [], favorites: [], nextOrderId: 1 })
})

describe('account page session isolation', () => {
  it('updates the profile form when the server account changes', () => {
    const account = { id: '1', email: 'first@example.test', username: 'first', displayName: 'First User', avatar: '', createdAt: 0 }
    act(() => useAccountStore.setState({ activeAccountId: '1', accounts: { '1': { account } } }))
    render(<MemoryRouter><AccountPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Unsaved' } })
    act(() => useAccountStore.setState({ accounts: { '1': { account: { ...account, displayName: 'Updated User' } } } }))
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Updated User')
  })

  it('discards unsaved personal data, passwords and delete confirmation on account switch', async () => {
    act(() => useAccountStore.setState({ activeAccountId: '1', accounts: { '1': { account: { id: '1', email: 'first@example.test', username: 'first', displayName: 'First User', avatar: '', createdAt: 0 } } } }))
    render(<MemoryRouter><AccountPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Unsaved secret name' } })
    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'old-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Удалить профиль' }))
    expect(screen.getByRole('button', { name: 'Да, удалить' })).toBeTruthy()

    act(() => useAccountStore.setState({ activeAccountId: '2', accounts: { '2': { account: { id: '2', email: 'second@example.test', username: 'second', displayName: 'Second User', avatar: '', createdAt: 0 } } } }))

    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Second User')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('second@example.test')
    expect((screen.getByLabelText('Текущий пароль') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Да, удалить' })).toBeNull()
    expect(screen.queryByDisplayValue('Unsaved secret name')).toBeNull()
  })
})

describe('account page session restore', () => {
  const account = { id: '1', email: 'first@example.test', username: 'first', displayName: 'First User', avatar: '', createdAt: 0 }

  it('does not request a session refresh when an account is already known', async () => {
    document.cookie = 'csrf_token=valid; path=/'
    act(() => useAccountStore.setState({ activeAccountId: '1', accounts: { '1': { account } } }))
    const mock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ detail: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', mock)

    render(<MemoryRouter><AccountPage /></MemoryRouter>)

    expect(await screen.findByLabelText('Имя')).toBeTruthy()
    expect(mock.mock.calls.some(([url]) => String(url).includes('/auth/refresh'))).toBe(false)
  })

  it('shows an explicit retry instead of the guest panel when the first check fails, then the guest panel', async () => {
    document.cookie = 'csrf_token=valid; path=/'
    let fail = true
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/refresh')) {
        return fail
          ? new Response(JSON.stringify({ detail: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
          : new Response(JSON.stringify({ detail: 'no session' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', mock)

    render(<MemoryRouter><AccountPage /></MemoryRouter>)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не удалось загрузить')
    // Neither a permanent skeleton nor a guest panel that hides the failure.
    expect(screen.queryByTestId('account-skeleton')).toBeNull()
    expect(screen.queryByText('Войдите в аккаунт, чтобы управлять профилем и заказами.')).toBeNull()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    expect(await screen.findByText('Войдите в аккаунт, чтобы управлять профилем и заказами.')).toBeTruthy()
    expect(screen.queryByTestId('account-skeleton')).toBeNull()
  })
})
