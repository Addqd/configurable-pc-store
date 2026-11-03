import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCartStore } from './cartStore'
import { removeAccountReviews } from '../data/reviewStorage'

/** Frontend-only demo accounts. This is NOT server-side authentication. */
export interface Account {
  id: string
  email: string
  username: string
  displayName: string
  avatar: string
  createdAt: number
}

type PasswordRecord = {
  salt: string
  hash: string
  algorithm?: 'pbkdf2-sha256'
  iterations?: number
}

type AccountRecord = { account: Account; password: PasswordRecord }
type Accounts = Record<string, AccountRecord>
export type AccountResult = { success: true } | { success: false; error: string }

type AccountState = {
  accounts: Accounts
  activeAccountId: string | null
  register: (email: string, username: string, displayName: string, password: string) => Promise<AccountResult>
  login: (identifier: string, password: string) => Promise<AccountResult>
  logout: () => void
  updateProfile: (updates: Partial<Pick<Account, 'displayName' | 'email' | 'username'>>) => AccountResult
  setAvatar: (avatar: string) => boolean
  changePassword: (currentPassword: string, newPassword: string) => Promise<AccountResult>
  deleteAccount: () => boolean
  verifyPassword: (accountId: string, password: string) => Promise<boolean>
}

export const selectActiveAccount = (state: AccountState): Account | null =>
  state.activeAccountId ? state.accounts[state.activeAccountId]?.account ?? null : null
export const selectIsAuthenticated = (state: AccountState): boolean => selectActiveAccount(state) !== null

const STORAGE_KEY = 'pc-builder-account'
const LEGACY_V2_KEY = 'pc-builder-account-v2'
const ITERATIONS = 120_000
const failure = (error: string): AccountResult => ({ success: false, error })
const normalizeEmail = (value: string) => value.trim().toLowerCase()
const normalizeUsername = (value: string) => value.trim()
const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

// Sign-in accepts either email or username: reserve BOTH identifiers across
// accounts so a username cannot impersonate another user's email (and vice versa).
function identifierTaken(accounts: Accounts, email: string, username: string, ignoreId?: string): boolean {
  const candidateEmail = normalizeEmail(email)
  const candidateUser = normalizeUsername(username).toLowerCase()
  return Object.entries(accounts).some(([id, record]) => {
    if (id === ignoreId) return false
    const existingEmail = normalizeEmail(record.account.email)
    const existingUser = normalizeUsername(record.account.username).toLowerCase()
    return existingEmail === candidateEmail || existingEmail === candidateUser ||
      existingUser === candidateEmail || existingUser === candidateUser
  })
}

// An async password calculation must never sign a user back in after a newer
// logout/login/registration. Every session-changing action invalidates older work.
let sessionEpoch = 0
const cancelled = (): AccountResult => failure('Действие отменено: состояние входа изменилось')

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validatedSnapshot(value: unknown): { accounts: Accounts; activeAccountId: string | null } {
  const valueState = isObject(value) ? value : {}
  const accounts: Accounts = {}
  const rawAccounts = isObject(valueState.accounts) ? valueState.accounts : {}
  for (const [id, raw] of Object.entries(rawAccounts)) {
    if (!isObject(raw) || !isObject(raw.account) || !isObject(raw.password)) continue
    const a = raw.account
    const p = raw.password
    if (typeof a.id !== 'string' || a.id !== id || typeof a.email !== 'string' ||
        typeof a.username !== 'string' || typeof a.displayName !== 'string' ||
        typeof p.salt !== 'string' || typeof p.hash !== 'string') continue
    accounts[id] = {
      account: {
        id, email: a.email, username: a.username, displayName: a.displayName,
        avatar: typeof a.avatar === 'string' ? a.avatar : '',
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : 0,
      },
      password: {
        salt: p.salt, hash: p.hash,
        ...(p.algorithm === 'pbkdf2-sha256' ? { algorithm: 'pbkdf2-sha256' as const } : {}),
        ...(typeof p.iterations === 'number' ? { iterations: p.iterations } : {}),
      },
    }
  }
  const activeId = valueState.activeAccountId
  return { accounts, activeAccountId: typeof activeId === 'string' && accounts[activeId] ? activeId : null }
}

function readStoredSnapshot(key: string): { accounts: Accounts; activeAccountId: string | null } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    if (!isObject(data)) return null
    return validatedSnapshot(data.state)
  } catch {
    return null
  }
}

/** One-time migration only. All subsequent persistence uses Zustand's persist middleware. */
function migratePreviousDemoStorage(): void {
  try {
    const legacy = readStoredSnapshot(LEGACY_V2_KEY)
    const previous = readStoredSnapshot(STORAGE_KEY)
    if (!legacy) return
    const accounts = { ...previous?.accounts, ...legacy.accounts }
    const activeAccountId = legacy.activeAccountId && accounts[legacy.activeAccountId]
      ? legacy.activeAccountId
      : null
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      state: { accounts, activeAccountId },
    }))
    localStorage.removeItem(LEGACY_V2_KEY)
  } catch {
    // If storage is unavailable, the demo remains usable for this tab.
  }
}

migratePreviousDemoStorage()

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

async function derivePassword(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt) as BufferSource, iterations,
  }, key, 256)
  return toBase64(new Uint8Array(derived))
}

async function newPasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await derivePassword(password, salt, ITERATIONS), algorithm: 'pbkdf2-sha256', iterations: ITERATIONS }
}

async function isValidPassword(record: PasswordRecord, password: string): Promise<boolean> {
  try {
    if (record.algorithm === 'pbkdf2-sha256') {
      return (await derivePassword(password, record.salt, record.iterations || ITERATIONS)) === record.hash
    }
    // Compatibility with the SHA-256 verifier previously written by PR #5.
    const raw = new TextEncoder().encode(record.salt + password)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
    return Array.from(digest, (x) => x.toString(16).padStart(2, '0')).join('') === record.hash
  } catch {
    return false
  }
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: {},
      activeAccountId: null,

      register: async (email, username, displayName, password) => {
        const epoch = ++sessionEpoch
        const mail = normalizeEmail(email)
        const user = normalizeUsername(username)
        const name = displayName.trim() || user
        if (!emailValid(mail)) return failure('Введите корректный email')
        if (user.length < 2) return failure('Имя пользователя должно содержать минимум 2 символа')
        if (name.length < 2) return failure('Имя должно содержать минимум 2 символа')
        if (password.length < 8) return failure('Пароль должен содержать минимум 8 символов')
        const duplicate = () => identifierTaken(get().accounts, mail, user)
        if (duplicate()) return failure('Email или имя пользователя уже заняты')
        try {
          const passwordRecord = await newPasswordRecord(password)
          if (epoch !== sessionEpoch) return cancelled()
          if (duplicate()) return failure('Email или имя пользователя уже заняты')
          const id = crypto.randomUUID()
          const account: Account = { id, email: mail, username: user, displayName: name, avatar: '', createdAt: Date.now() }
          set((s) => ({ accounts: { ...s.accounts, [id]: { account, password: passwordRecord } }, activeAccountId: id }))
          useCartStore.getState().setActiveAccountId(id)
          return { success: true }
        } catch {
          return failure('Не удалось создать аккаунт. Проверьте доступность защищённого контекста браузера.')
        }
      },

      login: async (identifier, password) => {
        const epoch = ++sessionEpoch
        const input = identifier.trim().toLowerCase()
        if (!input || !password) return failure('Введите логин и пароль')
        const found = Object.entries(get().accounts).find(([, r]) =>
          normalizeEmail(r.account.email) === input || r.account.username.toLowerCase() === input)
        if (!found) return failure('Неверный email/имя пользователя или пароль')
        const valid = await isValidPassword(found[1].password, password)
        if (epoch !== sessionEpoch) return cancelled()
        if (!valid) return failure('Неверный email/имя пользователя или пароль')
        const [id, record] = found
        // Upgrade old hashes on successful login, without losing existing demo accounts.
        if (record.password.algorithm !== 'pbkdf2-sha256') {
          try {
            const newPassword = await newPasswordRecord(password)
            if (epoch !== sessionEpoch) return cancelled()
            if (get().accounts[id]) {
              set((s) => ({ accounts: { ...s.accounts, [id]: { ...s.accounts[id], password: newPassword } } }))
            }
          } catch { /* Old demo verifier remains usable. */ }
        }
        if (epoch !== sessionEpoch || !get().accounts[id]) return cancelled()
        set({ activeAccountId: id })
        useCartStore.getState().setActiveAccountId(id)
        return { success: true }
      },

      logout: () => {
        sessionEpoch += 1
        set({ activeAccountId: null })
        useCartStore.getState().setActiveAccountId(null)
      },

      updateProfile: (updates) => {
        const id = get().activeAccountId
        const record = id && get().accounts[id]
        if (!id || !record) return failure('Нет активной сессии')
        const mail = updates.email === undefined ? record.account.email : normalizeEmail(updates.email)
        const user = updates.username === undefined ? record.account.username : normalizeUsername(updates.username)
        const name = updates.displayName === undefined ? record.account.displayName : updates.displayName.trim()
        if (!emailValid(mail)) return failure('Введите корректный email')
        if (user.length < 2 || name.length < 2) return failure('Имя должно содержать минимум 2 символа')
        if (identifierTaken(get().accounts, mail, user, id)) {
          return failure('Email или имя пользователя уже заняты')
        }
        set((s) => ({
          accounts: {
            ...s.accounts,
            [id]: { ...s.accounts[id], account: { ...s.accounts[id].account, email: mail, username: user, displayName: name } },
          },
        }))
        return { success: true }
      },

      setAvatar: (avatar) => {
        const id = get().activeAccountId
        if (!id || !get().accounts[id]) return false
        set((s) => ({
          accounts: { ...s.accounts, [id]: { ...s.accounts[id], account: { ...s.accounts[id].account, avatar } } },
        }))
        return true
      },

      changePassword: async (currentPassword, newPassword) => {
        const id = get().activeAccountId
        const record = id && get().accounts[id]
        if (!id || !record) return failure('Нет активной сессии')
        const epoch = sessionEpoch
        if (newPassword.length < 8) return failure('Новый пароль должен содержать минимум 8 символов')
        if (!await isValidPassword(record.password, currentPassword)) return failure('Неверный текущий пароль')
        try {
          const passwordRecord = await newPasswordRecord(newPassword)
          if (epoch !== sessionEpoch || get().activeAccountId !== id || !get().accounts[id]) return failure('Сессия изменилась')
          set((s) => ({ accounts: { ...s.accounts, [id]: { ...s.accounts[id], password: passwordRecord } } }))
          return { success: true }
        } catch {
          return failure('Не удалось изменить пароль')
        }
      },

      deleteAccount: () => {
        const id = get().activeAccountId
        if (!id || !get().accounts[id]) return false
        sessionEpoch += 1
        const next = { ...get().accounts }
        delete next[id]
        set({ accounts: next, activeAccountId: null })
        useCartStore.getState().removeOrdersForAccount(id)
        removeAccountReviews(id)
        useCartStore.getState().setActiveAccountId(null)
        return true
      },

      verifyPassword: async (id, password) => {
        const record = get().accounts[id]
        return record ? isValidPassword(record.password, password) : false
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s) => ({ accounts: s.accounts, activeAccountId: s.activeAccountId }),
      merge: (saved, current) => {
        const snapshot = validatedSnapshot(saved)
        return { ...current, ...snapshot }
      },
    },
  ),
)
