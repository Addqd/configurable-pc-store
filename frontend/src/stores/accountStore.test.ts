import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { useAccountStore, selectActiveAccount, selectIsAuthenticated } from './accountStore'
import { useCartStore } from './cartStore'

// jsdom doesn't expose subtle in every version; Vite runs in a secure context.
vi.stubGlobal('crypto', webcrypto)

const email = 'demo@example.com'
const name = 'demo'
const password = 'DemoPass123'

beforeEach(() => {
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1, activeAccountId: null })
  localStorage.removeItem('pc-builder-account-v2')
})

describe('demo account store', () => {
  it('registers and persists the account without saving the password in plaintext', async () => {
    expect((await useAccountStore.getState().register(email, name, 'Demo', password)).success).toBe(true)
    expect(selectIsAuthenticated(useAccountStore.getState())).toBe(true)
    expect(selectActiveAccount(useAccountStore.getState())?.email).toBe(email)
    const saved = localStorage.getItem('pc-builder-account') || ''
    expect(saved).toContain(email)
    expect(saved).not.toContain(password)
    expect(saved).not.toContain('isAuthenticated')
    expect(saved).not.toContain('activeAccount"')
  })

  it('logs out, rejects invalid credentials, and logs in by username or email', async () => {
    await useAccountStore.getState().register(email, name, 'Demo', password)
    useAccountStore.getState().logout()
    expect(selectIsAuthenticated(useAccountStore.getState())).toBe(false)
    expect((await useAccountStore.getState().login(name, 'wrong')).success).toBe(false)
    expect((await useAccountStore.getState().login('DeMo', password)).success).toBe(true)
    useAccountStore.getState().logout()
    expect((await useAccountStore.getState().login(email.toUpperCase(), password)).success).toBe(true)
  })

  it('does not permit duplicate email or username', async () => {
    await useAccountStore.getState().register(email, name, 'Demo', password)
    expect((await useAccountStore.getState().register(email.toUpperCase(), 'second', 'Second', password)).success).toBe(false)
    expect((await useAccountStore.getState().register('second@example.com', name.toUpperCase(), 'Second', password)).success).toBe(false)
  })

  it('restores a persisted account and ignores stale derived getter values', async () => {
    await useAccountStore.getState().register(email, name, 'Demo', password)
    const saved = localStorage.getItem('pc-builder-account')!
    useAccountStore.setState({ accounts: {}, activeAccountId: null })
    localStorage.setItem('pc-builder-account', saved)
    await useAccountStore.persist.rehydrate()
    expect(selectIsAuthenticated(useAccountStore.getState())).toBe(true)
    expect(selectActiveAccount(useAccountStore.getState())?.username).toBe(name)
  })

  it('updates profile and password without changing the account identity', async () => {
    await useAccountStore.getState().register(email, name, 'Demo', password)
    const id = useAccountStore.getState().activeAccountId
    expect(useAccountStore.getState().updateProfile({ displayName: 'Changed', email: 'new@example.com' }).success).toBe(true)
    expect(selectActiveAccount(useAccountStore.getState())?.id).toBe(id)
    expect((await useAccountStore.getState().changePassword('wrong', 'NewPass456')).success).toBe(false)
    expect((await useAccountStore.getState().changePassword(password, 'NewPass456')).success).toBe(true)
    useAccountStore.getState().logout()
    expect((await useAccountStore.getState().login('new@example.com', password)).success).toBe(false)
    expect((await useAccountStore.getState().login('new@example.com', 'NewPass456')).success).toBe(true)
  })

  it('deletes only the active account and its orders', async () => {
    await useAccountStore.getState().register(email, name, 'Demo', password)
    const id = useAccountStore.getState().activeAccountId!
    useCartStore.getState().purchaseProduct({ id: 1, name: 'Test', price: 1000, image: '', specs: [], category: 'Other' }, 1)
    useCartStore.getState().setActiveAccountId(null)
    useCartStore.getState().purchaseProduct({ id: 2, name: 'Guest', price: 500, image: '', specs: [], category: 'Other' }, 1)
    useCartStore.getState().setActiveAccountId(id)
    expect(useAccountStore.getState().deleteAccount()).toBe(true)
    expect(selectIsAuthenticated(useAccountStore.getState())).toBe(false)
    expect(useCartStore.getState().orders).toHaveLength(1)
    expect(useCartStore.getState().orders[0].ownerId).toBeUndefined()
    expect((await useAccountStore.getState().login(name, password)).success).toBe(false)
  })
})
