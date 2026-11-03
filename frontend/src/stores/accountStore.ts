import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCartStore } from './cartStore'

// ─── Account model ───────────────────────────────────────────────
export interface Account {
  id: string              // stable identifier (uuid-like)
  email: string           // unique per account
  username: string        // unique per account
  displayName: string
  avatar: string          // base64 data URL, or empty for placeholder
  createdAt: number
}

// ─── Password verifier stored per account ────────────────────────
interface PasswordRecord {
  // Simple demo verifier: base64-encoded hex of the lower 64 bits of SHA-256
  // Salt is the first 16 chars of the account id.
  salt: string
  hash: string
}

interface AccountWithPassword {
  account: Account
  password: PasswordRecord
}

// ─── Store state ─────────────────────────────────────────────────
interface AccountState {
  // All registered accounts (keyed by id)
  accounts: Record<string, AccountWithPassword>
  // Currently active session
  activeAccountId: string | null
  // Derived: is the user authenticated?
  isAuthenticated: boolean
  // Derived: current account or null
  activeAccount: Account | null

  // ── Actions ───────────────────────────────────────────────────
  register: (email: string, username: string, displayName: string, password: string) => { success: boolean; error?: string }
  login: (identifier: string, password: string) => { success: boolean; error?: string }
  logout: () => void
  updateProfile: (updates: Partial<Pick<Account, 'displayName' | 'email' | 'username'>>) => { success: boolean; error?: string }
  setAvatar: (avatar: string) => void
  changePassword: (currentPassword: string, newPassword: string) => { success: boolean; error?: string }
  deleteAccount: () => boolean
  activateAccount: (id: string) => void

  // Password helper
  verifyPassword: (accountId: string, password: string) => boolean
}

// ─── Simple SHA-256 verifier ─────────────────────────────────────
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function makeSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  // Use salt + password for a simple demo verifier
  return sha256Hex(`${salt}${password}`)
}

// ─── Normalize / validate ────────────────────────────────────────
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizeUsername(username: string): string {
  return username.trim()
}

function generateId(): string {
  // Simple id: timestamp + random
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const ts = Date.now().toString(36)
  return ts + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).slice(0, 24)
}

// ─── Store ───────────────────────────────────────────────────────
const ACCOUNT_STORAGE_KEY = 'pc-builder-account-v2'

function loadFromStorage(): Pick<AccountState, 'accounts' | 'activeAccountId'> {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (!raw) return { accounts: {}, activeAccountId: null }
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1) return { accounts: {}, activeAccountId: null }
    return { accounts: parsed.state?.accounts || {}, activeAccountId: parsed.state?.activeAccountId || null }
  } catch {
    return { accounts: {}, activeAccountId: null }
  }
}

function saveToStorage(accounts: AccountState['accounts'], activeAccountId: string | null): void {
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ version: 1, state: { accounts, activeAccountId } }))
  } catch {
    // ignore
  }
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      ...loadFromStorage(),

      get isAuthenticated() {
        const { activeAccountId, accounts } = get()
        return activeAccountId !== null && activeAccountId in accounts
      },

      get activeAccount() {
        const { activeAccountId, accounts } = get()
        if (!activeAccountId || !(activeAccountId in accounts)) return null
        return accounts[activeAccountId].account
      },

      register: async (email, username, displayName, password) => {
        const normalizedEmail = normalizeEmail(email)
        const normalizedUsername = normalizeUsername(username)

        // Validate inputs
        if (!normalizedEmail) return { success: false, error: 'Введите email' }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return { success: false, error: 'Неверный формат email' }
        if (!normalizedUsername) return { success: false, error: 'Введите имя пользователя' }
        if (normalizedUsername.length < 2) return { success: false, error: 'Имя пользователя должно содержать минимум 2 символа' }
        if (password.length < 4) return { success: false, error: 'Пароль должен содержать минимум 4 символа' }

        const { accounts } = get()
        // Check duplicate email
        for (const record of Object.values(accounts)) {
          if (normalizeEmail(record.account.email) === normalizedEmail) {
            return { success: false, error: 'Пользователь с таким email уже существует' }
          }
        }
        // Check duplicate username
        for (const record of Object.values(accounts)) {
          if (record.account.username.toLowerCase() === normalizedUsername.toLowerCase()) {
            return { success: false, error: 'Такое имя пользователя уже занято' }
          }
        }

        const id = generateId()
        const salt = makeSalt()
        const hash = await hashPassword(password, salt)

        const newAccount: AccountWithPassword = {
          account: {
            id,
            email: normalizedEmail,
            username: normalizedUsername,
            displayName: displayName || normalizedUsername,
            avatar: '',
            createdAt: Date.now(),
          },
          password: { salt, hash },
        }

        set((state) => ({
          accounts: { ...state.accounts, [id]: newAccount },
          activeAccountId: id,
        }))
        saveToStorage(get().accounts, id)
        useCartStore.getState().setActiveAccountId(id)

        return { success: true }
      },

      login: async (identifier, password) => {
        const { accounts } = get()
        const normalizedIdentifier = identifier.trim().toLowerCase()

        if (!normalizedIdentifier) return { success: false, error: 'Введите email или имя пользователя' }
        if (!password) return { success: false, error: 'Введите пароль' }

        // Find account by email or username
        let found: { id: string; record: AccountWithPassword } | null = null
        for (const [id, record] of Object.entries(accounts)) {
          if (
            normalizeEmail(record.account.email) === normalizedIdentifier ||
            record.account.username.toLowerCase() === normalizedIdentifier
          ) {
            found = { id, record }
            break
          }
        }

        if (!found) return { success: false, error: 'Неверный email/имя пользователя или пароль' }

        const verified = await get().verifyPassword(found.id, password)
        if (!verified) return { success: false, error: 'Неверный email/имя пользователя или пароль' }

        set({ activeAccountId: found.id })
        saveToStorage(get().accounts, found.id)
        useCartStore.getState().setActiveAccountId(found.id)
        return { success: true }
      },

      logout: () => {
        set({ activeAccountId: null })
        useCartStore.getState().setActiveAccountId(null)
        saveToStorage(get().accounts, null)
      },

      updateProfile: (updates) => {
        const { activeAccountId, accounts } = get()
        if (!activeAccountId || !(activeAccountId in accounts)) {
          return { success: false, error: 'Нет активной сессии' }
        }

        const account = accounts[activeAccountId].account
        const normalizedEmail = updates.email !== undefined ? normalizeEmail(updates.email) : account.email
        const normalizedUsername = updates.username !== undefined ? normalizeUsername(updates.username) : account.username
        const newDisplayName = updates.displayName !== undefined ? updates.displayName.trim() : account.displayName

        // Validate
        if (updates.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
          return { success: false, error: 'Неверный формат email' }
        }
        if (updates.username !== undefined && (!normalizedUsername || normalizedUsername.length < 2)) {
          return { success: false, error: 'Имя пользователя должно содержать минимум 2 символа' }
        }
        if (updates.displayName !== undefined && (!newDisplayName || newDisplayName.length < 2)) {
          return { success: false, error: 'Имя должно содержать минимум 2 символа' }
        }

        // Check uniqueness against other accounts
        for (const [otherId, record] of Object.entries(accounts)) {
          if (otherId === activeAccountId) continue
          if (normalizeEmail(record.account.email) === normalizedEmail) {
            return { success: false, error: 'Пользователь с таким email уже существует' }
          }
          if (record.account.username.toLowerCase() === normalizedUsername.toLowerCase()) {
            return { success: false, error: 'Такое имя пользователя уже занято' }
          }
        }

        set((state) => {
          const updated = { ...state.accounts, [activeAccountId]: { ...state.accounts[activeAccountId], account: { ...account, email: updates.email !== undefined ? normalizedEmail : account.email, username: updates.username !== undefined ? normalizedUsername : account.username, displayName: updates.displayName !== undefined ? newDisplayName : account.displayName } } }
          saveToStorage(updated, state.activeAccountId)
          return { accounts: updated }
        })

        return { success: true }
      },

      setAvatar: (avatar) => {
        const { activeAccountId, accounts } = get()
        if (!activeAccountId || !(activeAccountId in accounts)) return
        set((state) => {
          const updated = {
            ...state.accounts,
            [activeAccountId]: {
              ...state.accounts[activeAccountId],
              account: { ...state.accounts[activeAccountId].account, avatar },
            },
          }
          saveToStorage(updated, state.activeAccountId)
          return { accounts: updated }
        })
      },

      changePassword: async (currentPassword, newPassword) => {
        const { activeAccountId, accounts } = get()
        if (!activeAccountId || !(activeAccountId in accounts)) {
          return { success: false, error: 'Нет активной сессии' }
        }

        if (!currentPassword) return { success: false, error: 'Введите текущий пароль' }
        if (newPassword.length < 4) return { success: false, error: 'Новый пароль должен содержать минимум 4 символа' }

        const record = accounts[activeAccountId]
        const currentVerified = await get().verifyPassword(activeAccountId, currentPassword)
        if (!currentVerified) return { success: false, error: 'Неверный текущий пароль' }

        const newHash = await hashPassword(newPassword, record.password.salt)

        set((state) => {
          const updated = {
            ...state.accounts,
            [activeAccountId]: {
              ...state.accounts[activeAccountId],
              password: { ...record.password, hash: newHash },
            },
          }
          saveToStorage(updated, state.activeAccountId)
          return { accounts: updated }
        })

        return { success: true }
      },

      deleteAccount: () => {
        const { activeAccountId, accounts } = get()
        if (!activeAccountId) return false

        const next = { ...accounts }
        delete next[activeAccountId]
        set({ activeAccountId: null, accounts: next })
        saveToStorage(next, null)
        return true
      },

      activateAccount: (id) => {
        const { accounts } = get()
        if (id in accounts) {
          set({ activeAccountId: id })
          useCartStore.getState().setActiveAccountId(id)
        }
      },

      verifyPassword: async (accountId, password) => {
        const { accounts } = get()
        const record = accounts[accountId]
        if (!record) return false
        const computed = await hashPassword(password, record.password.salt)
        return computed === record.password.hash
      },
    }),
    {
      name: 'pc-builder-account',
      version: 1,
      // Only persist actual state, not computed getters
      partialize: (state) => ({
        accounts: state.accounts,
        activeAccountId: state.activeAccountId,
      }),
    }
  )
)
