import { create } from 'zustand'
import { queryClient } from '../api/queryClient'
import { ApiError, onSessionExpired, refreshSession, setAccessToken, waitForRefresh } from '../api/transport'
import {
  registerApiV1AuthRegisterPost, loginApiV1AuthLoginPost, getMeApiV1AuthMeGet,
  logoutApiV1AuthLogoutPost, updateProfileApiV1AuthProfilePatch,
  changePasswordApiV1AuthPasswordPatch, deleteAccountApiV1AuthDelete,
} from '../api/generated/client'
import type { UserOut } from '../api/generated/model'

export interface Account {
  id: string
  email: string
  username: string
  displayName: string
  avatar: string
  createdAt: number
}
export type AccountResult = { success: true } | { success: false; error: string }
type AccountRecord = { account: Account; password?: { salt: string; hash: string } }
type AccountState = {
  accounts: Record<string, AccountRecord>
  activeAccountId: string | null
  restore: () => Promise<void>
  register: (email: string, username: string, displayName: string, password: string) => Promise<AccountResult>
  login: (identifier: string, password: string) => Promise<AccountResult>
  logout: () => Promise<void>
  updateProfile: (updates: Partial<Pick<Account, 'displayName' | 'email' | 'username'>>) => Promise<AccountResult>
  setAvatar: (avatar: string) => Promise<boolean>
  changePassword: (current: string, next: string) => Promise<AccountResult>
  deleteAccount: () => Promise<boolean>
}

export const selectActiveAccount = (state: AccountState): Account | null =>
  state.activeAccountId ? state.accounts[state.activeAccountId]?.account ?? null : null
export const selectIsAuthenticated = (state: AccountState): boolean => selectActiveAccount(state) !== null

const failure = (error: string): AccountResult => ({ success: false, error })
const errorMessage = (error: unknown) => error instanceof ApiError && error.status === 409
  ? 'Email или имя пользователя уже заняты'
  : error instanceof ApiError && error.status === 401
    ? 'Неверный email/имя пользователя или пароль'
    : 'Не удалось выполнить запрос. Попробуйте ещё раз.'
let epoch = 0
let restorePromise: Promise<void> | null = null
let logoutPromise: Promise<void> | null = null
let authQueue: Promise<void> = Promise.resolve()

function serializeAuth<T>(operation: () => Promise<T>): Promise<T> {
  const result = authQueue.then(operation, operation)
  authQueue = result.then(() => undefined, () => undefined)
  return result
}

function convert(user: UserOut): Account {
  return {
    id: String(user.id), email: user.email, username: user.username, displayName: user.display_name,
    avatar: user.avatar_url ?? '', createdAt: user.created_at ? Date.parse(user.created_at) : 0,
  }
}

function clearSession() {
  epoch += 1
  setAccessToken(null)
  void queryClient.cancelQueries()
  queryClient.clear()
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
}

function acceptUser(user: UserOut) {
  const account = convert(user)
  useAccountStore.setState({ accounts: { [account.id]: { account } }, activeAccountId: account.id })
}

export const useAccountStore = create<AccountState>()((_set, get) => ({
  accounts: {}, activeAccountId: null,
  restore: async () => {
    if (restorePromise) return restorePromise
    const version = epoch
    const pending = (async () => {
      try {
        await refreshSession()
        const user = await getMeApiV1AuthMeGet()
        if (version === epoch) acceptUser(user)
      } catch { if (version === epoch) clearSession() }
    })()
    restorePromise = pending
    try { await pending } finally { if (restorePromise === pending) restorePromise = null }
  },
  register: async (email, username, displayName, password) => {
    const version = epoch
    try {
      await registerApiV1AuthRegisterPost({ email, username, display_name: displayName, password })
      if (version !== epoch) return failure('Аккаунт создан, но сессия изменилась. Войдите вручную.')
      const result = await get().login(username, password)
      return result.success ? result : failure('Аккаунт создан, но войти не удалось. Попробуйте войти позже.')
    } catch (error) { return failure(errorMessage(error)) }
  },
  login: async (identifier, password) => {
    clearSession()
    const version = epoch
    return serializeAuth(async () => { try {
      await waitForRefresh()
      if (version !== epoch) return failure('Сессия изменилась')
      const tokens = await loginApiV1AuthLoginPost({ email_or_username: identifier, password })
      if (version !== epoch) return failure('Сессия изменилась')
      setAccessToken(tokens.access_token)
      const user = await getMeApiV1AuthMeGet()
      if (version !== epoch) return failure('Сессия изменилась')
      acceptUser(user)
      return { success: true }
    } catch (error) {
      if (version === epoch) clearSession()
      return failure(errorMessage(error))
    } })
  },
  logout: async () => {
    if (logoutPromise) return logoutPromise
    const version = epoch
    const pending = serializeAuth(async () => {
      await waitForRefresh()
      if (version !== epoch) throw new ApiError(401)
      await logoutApiV1AuthLogoutPost()
      if (version === epoch) clearSession()
    })
    logoutPromise = pending
    try { await pending } finally { if (logoutPromise === pending) logoutPromise = null }
  },
  updateProfile: async (updates) => {
    const version = epoch
    try {
      const user = await updateProfileApiV1AuthProfilePatch({
        display_name: updates.displayName, email: updates.email, username: updates.username,
      })
      if (version !== epoch) return failure('Сессия изменилась')
      acceptUser(user)
      return { success: true }
    } catch (error) { return failure(errorMessage(error)) }
  },
  setAvatar: async (avatar) => {
    const version = epoch
    try {
      const user = await updateProfileApiV1AuthProfilePatch({ avatar_url: avatar })
      if (version !== epoch) return false
      acceptUser(user)
      return true
    } catch { return false }
  },
  changePassword: async (current, next) => {
    const version = epoch
    try {
      await changePasswordApiV1AuthPasswordPatch({ old_password: current, new_password: next })
      if (version !== epoch) return failure('Сессия изменилась')
      clearSession()
      return { success: true }
    } catch (error) { return failure(errorMessage(error)) }
  },
  deleteAccount: async () => {
    try { await deleteAccountApiV1AuthDelete(); clearSession(); return true }
    catch { return false }
  },
}))

onSessionExpired(clearSession)
