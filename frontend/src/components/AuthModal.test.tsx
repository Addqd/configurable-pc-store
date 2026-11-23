import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { render } from '../test-utils'
import i18n from '../i18n'
import { AuthModal } from './AuthModal'
import { useAccountStore } from '../stores/accountStore'
import { queryClient } from '../api/queryClient'
import { setAccessToken } from '../api/transport'

/**
 * `window.location.reload` is a non-configurable jsdom property, so the reload
 * boundary is observed at the store helper the components call. The behaviour of
 * that helper itself is verified in a real browser.
 */
const reloadAfterAuthChange = vi.hoisted(() => vi.fn())

vi.mock('../stores/accountStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stores/accountStore')>()
  return { ...actual, reloadAfterAuthChange }
})

const user = {
  id: 12, email: 'person@example.test', username: 'person', display_name: 'Person', avatar_url: null,
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  setAccessToken(null)
  document.cookie = 'csrf_token=test; path=/'
  reloadAfterAuthChange.mockClear()
})

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  queryClient.clear()
  document.cookie = 'csrf_token=; Max-Age=0; path=/'
  await act(async () => { await i18n.changeLanguage('ru') })
})

const openLogin = (onClose = vi.fn()) => {
  render(<AuthModal isOpen onClose={onClose} />)
  return onClose
}

const submitLogin = (identifier = 'person', password = 'StrongPassword123!') => {
  fireEvent.change(screen.getByLabelText('Email или имя пользователя'), { target: { value: identifier } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
}

const successfulAuthFetch = () => vi.fn(async (url: string) => {
  if (url.endsWith('/auth/login')) return json({ access_token: 'access', token_type: 'bearer' })
  if (url.endsWith('/auth/register')) return json(user, 201)
  return json(user)
})

describe('auth modal reload boundary', () => {
  it('reloads the page once after a successful login', async () => {
    vi.stubGlobal('fetch', successfulAuthFetch())
    const onClose = openLogin()
    submitLogin()

    await waitFor(() => expect(reloadAfterAuthChange).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useAccountStore.getState().activeAccountId).toBe('12')
  })

  it('does not reload when the credentials are rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'invalid' }, 401)))
    openLogin()
    submitLogin('person', 'wrong-password')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(reloadAfterAuthChange).not.toHaveBeenCalled()
  })

  it('does not reload on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    openLogin()
    submitLogin()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(reloadAfterAuthChange).not.toHaveBeenCalled()
  })

  it('does not reload when the form is invalid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    openLogin()
    submitLogin('   ', '')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(reloadAfterAuthChange).not.toHaveBeenCalled()
  })

  it('reloads once after a registration that signs the account in', async () => {
    const fetchMock = successfulAuthFetch()
    vi.stubGlobal('fetch', fetchMock)
    openLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Имя пользователя'), { target: { value: 'newbie' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'StrongPassword123!' } })
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'StrongPassword123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    await waitFor(() => expect(reloadAfterAuthChange).toHaveBeenCalledTimes(1))
    const calls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(calls.some((url) => url.endsWith('/auth/register'))).toBe(true)
    // Registration logs the new account in automatically before the reload.
    expect(calls.some((url) => url.endsWith('/auth/login'))).toBe(true)
    expect(useAccountStore.getState().activeAccountId).toBe('12')
  })

  it('does not reload when registration fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'taken' }, 409)))
    openLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Имя пользователя'), { target: { value: 'newbie' } })
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'StrongPassword123!' } })
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'StrongPassword123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(reloadAfterAuthChange).not.toHaveBeenCalled()
  })
})
