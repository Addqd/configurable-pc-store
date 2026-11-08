import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectActiveAccount, useAccountStore } from './accountStore'
import { apiFetch, setAccessToken } from '../api/transport'
import { queryClient } from '../api/queryClient'

const user = { id: 12, email: 'person@example.test', username: 'person', display_name: 'Person', avatar_url: null }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

describe('server account session', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: {}, activeAccountId: null })
    document.cookie = 'csrf_token=test; path=/'
  })
  afterEach(() => { vi.unstubAllGlobals(); document.cookie = 'csrf_token=; Max-Age=0; path=/' })

  it('logs in through the backend and fetches the authenticated user', async () => {
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/login')) return json({ access_token: 'access', token_type: 'bearer' })
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access')
      return json(user)
    })
    vi.stubGlobal('fetch', mock)
    expect((await useAccountStore.getState().login('person', 'password')).success).toBe(true)
    expect(selectActiveAccount(useAccountStore.getState())?.id).toBe('12')
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('does not create a local session when login fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'invalid' }, 401)))
    expect((await useAccountStore.getState().login('person', 'wrong')).success).toBe(false)
    expect(selectActiveAccount(useAccountStore.getState())).toBeNull()
  })

  it('keeps the profile unchanged when the server rejects an update', async () => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'conflict' }, 409)))
    expect((await useAccountStore.getState().updateProfile({ displayName: 'Changed' })).success).toBe(false)
    expect(selectActiveAccount(useAccountStore.getState())?.displayName).toBe('Person')
  })

  it('retains the session when server logout fails, so it cannot appear revoked', async () => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'unavailable' }, 503)))
    await expect(useAccountStore.getState().logout()).rejects.toMatchObject({ status: 503 })
    expect(selectActiveAccount(useAccountStore.getState())?.id).toBe('12')
  })

  it('only reports a successful logout after the server accepts it', async () => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    const mock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('test')
      return json({ detail: 'Logged out' })
    })
    vi.stubGlobal('fetch', mock)
    await useAccountStore.getState().logout()
    expect(selectActiveAccount(useAccountStore.getState())).toBeNull()
  })

  it('does not let an older login overwrite a later account session', async () => {
    let finishFirst!: (response: Response) => void
    let loginCount = 0
    const mock = vi.fn(async (url: string) => {
      if (url.endsWith('/login')) {
        loginCount += 1
        if (loginCount === 1) return new Promise<Response>(resolve => { finishFirst = resolve })
        return json({ access_token: 'new', token_type: 'bearer' })
      }
      return json(user)
    })
    vi.stubGlobal('fetch', mock)
    const first = useAccountStore.getState().login('first', 'password')
    await vi.waitFor(() => expect(loginCount).toBe(1))
    const second = useAccountStore.getState().login('second', 'password')
    expect(loginCount).toBe(1)
    finishFirst(json({ access_token: 'old', token_type: 'bearer' }))
    expect((await first).success).toBe(false)
    expect((await second).success).toBe(true)
    expect(loginCount).toBe(2)
    expect(selectActiveAccount(useAccountStore.getState())?.id).toBe('12')
  })

  it('clears private session state when refresh is rejected', async () => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    setAccessToken('expired')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'expired' }, 401)))
    await expect(apiFetch('/api/v1/cart', {})).rejects.toBeTruthy()
    expect(selectActiveAccount(useAccountStore.getState())).toBeNull()
  })

  it('clears account and cached private data after password change', async () => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    setAccessToken('old-access')
    queryClient.setQueryData(['private-cart'], { items: ['private'] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Password changed' })))
    expect((await useAccountStore.getState().changePassword('old-password', 'new-password')).success).toBe(true)
    expect(selectActiveAccount(useAccountStore.getState())).toBeNull()
    expect(queryClient.getQueryData(['private-cart'])).toBeUndefined()
  })

  it('retains the current session when password change is rejected', async () => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'wrong' }, 400)))
    expect((await useAccountStore.getState().changePassword('wrong', 'new-password')).success).toBe(false)
    expect(selectActiveAccount(useAccountStore.getState())?.id).toBe('12')
  })

  it.each(['logout', 'switch'] as const)('does not report a stale password change after %s', async (action) => {
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    setAccessToken(null)
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/password')) return new Promise<Response>(resolve => { finish = resolve })
      if (url.endsWith('/logout')) return json({ detail: 'Logged out' })
      if (url.endsWith('/login')) return json({ access_token: 'new', token_type: 'bearer' })
      return json({ ...user, id: 42 })
    }))
    const change = useAccountStore.getState().changePassword('old-password', 'new-password')
    await vi.waitFor(() => expect(finish).toBeDefined())
    if (action === 'logout') await useAccountStore.getState().logout()
    else expect((await useAccountStore.getState().login('other', 'password')).success).toBe(true)
    if (action === 'switch') queryClient.setQueryData(['new-user-private'], 'preserved')
    finish(json({ detail: 'Password changed' }))
    expect((await change).success).toBe(false)
    expect(selectActiveAccount(useAccountStore.getState())?.id ?? null).toBe(action === 'switch' ? '42' : null)
    if (action === 'switch') expect(queryClient.getQueryData(['new-user-private'])).toBe('preserved')
  })
})
