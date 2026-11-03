import { useState, useRef, useCallback } from 'react'
import { Header } from '../components/Header'
import { useAccountStore } from '../stores/accountStore'
import { useCartStore } from '../stores/cartStore'
import placeholder from '../assets/placeholder.jpg'
import { FiCamera, FiCheck, FiAlertCircle } from 'react-icons/fi'
import { FiTrash2 } from 'react-icons/fi'
import { Link } from 'react-router'

function getAccountOrderCount(accountId: string): number {
  const state = useCartStore.getState()
  return state.orders.filter((o) => o.ownerId === accountId).length
}

function getAccountReviewCount(accountId: string): number {
  let count = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('pc-builder-product-reviews:')) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
          const reviews: unknown[] = JSON.parse(raw)
          if (!Array.isArray(reviews)) continue
          count += reviews.filter((r) => {
            if (typeof r !== 'object' || r === null) return false
            const rev = r as Record<string, unknown>
            return rev.authorId === accountId
          }).length
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return count
}

function useProfileStats() {
  const account = useAccountStore.getState().activeAccount
  if (!account) return { purchaseCount: 0, reviewCount: 0 }
  return {
    purchaseCount: getAccountOrderCount(account.id),
    reviewCount: getAccountReviewCount(account.id),
  }
}

interface AvatarUploaderProps {
  currentAvatar: string
  onAvatarChange: (avatar: string) => void
}

function AvatarUploader({ currentAvatar, onAvatarChange }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const MAX_SIZE = 2 * 1024 * 1024 // 2MB

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      if (file.size > MAX_SIZE) return
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          onAvatarChange(result)
        }
      }
      reader.readAsDataURL(file)
    },
    [onAvatarChange],
  )

  const handleClick = () => inputRef.current?.click()
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so the same file can be selected again
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-primary hover:bg-surface-3 hover:text-primary transition-colors"
      >
        <FiCamera className="w-4 h-4" />
        Изменить аватар
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
        aria-label="Выбрать файл аватара"
      />
    </>
  )
}

interface ToastMessage {
  type: 'success' | 'error'
  text: string
}

export function AccountPage() {
  const account = useAccountStore((s) => s.activeAccount)
  const isAuthenticated = useAccountStore((s) => s.isAuthenticated)
  const updateProfile = useAccountStore((s) => s.updateProfile)
  const setAvatar = useAccountStore((s) => s.setAvatar)
  const changePassword = useAccountStore((s) => s.changePassword)
  const deleteAccount = useAccountStore((s) => s.deleteAccount)
  const stats = useProfileStats()

  // Editable profile fields
  const [displayName, setDisplayName] = useState(account?.displayName || '')
  const [email, setEmail] = useState(account?.email || '')
  const [profileError, setProfileError] = useState('')
  const [profileToast, setProfileToast] = useState<ToastMessage | null>(null)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (!account) {
    return (
      <div className="min-h-screen bg-surface-2">
        <Header />
        <main className="pt-24 px-4 flex flex-col items-center justify-center text-center">
          <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-8 sm:p-12 shadow-[0_5px_24px_var(--color-shadow)]">
            <h2 className="text-xl font-bold text-text-primary mb-2">Личный кабинет</h2>
            <p className="text-text-muted mb-6">Войдите в аккаунт, чтобы управлять профилем и заказями.</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              На главную
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const handleSaveProfile = async () => {
    setProfileError('')
    setProfileToast(null)
    const res = await updateProfile({ displayName, email })
    if (res.success) {
      setProfileToast({ type: 'success', text: 'Данные сохранены' })
      setTimeout(() => setProfileToast(null), 3000)
    } else {
      setProfileError(res.error)
    }
  }

  const handlePasswordChange = async () => {
    setPasswordError('')
    setPasswordSuccess('')
    if (newPassword !== confirmPassword) {
      setPasswordError('Пароли не совпадают')
      return
    }
    const res = await changePassword(currentPassword, newPassword)
    if (res.success) {
      setPasswordSuccess('Пароль изменён')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(''), 3000)
    } else {
      setPasswordError(res.error)
    }
  }

  const handleDelete = () => {
    deleteAccount()
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />
      <main className="pt-24 px-4">
        <div className="max-w-[860px] mx-auto py-8 space-y-6">
          {/* Header section */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_5px_24px_var(--color-shadow)]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Avatar */}
              <div className="relative shrink-0">
                <img
                  src={account.avatar || placeholder}
                  alt={account.displayName}
                  className="w-28 h-28 rounded-full object-cover bg-surface-3"
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-text-primary mb-1">Личный кабинет</h1>
                <p className="text-base font-medium text-text-primary mb-0.5">{account.displayName}</p>
                <p className="text-sm text-text-muted mb-4">{account.email}</p>
                <AvatarUploader currentAvatar={account.avatar} onAvatarChange={setAvatar} />
              </div>

              {/* Stats */}
              <div className="flex gap-4 sm:flex-col shrink-0">
                <div className="flex-1 sm:min-w-[120px] rounded-xl bg-surface-2 border border-border p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mb-1">Покупок</p>
                  <p className="text-3xl font-bold text-text-primary">{stats.purchaseCount}</p>
                </div>
                <div className="flex-1 sm:min-w-[120px] rounded-xl bg-surface-2 border border-border p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mb-1">Отзывов</p>
                  <p className="text-3xl font-bold text-text-primary">{stats.reviewCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Personal info card */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_5px_24px_var(--color-shadow)]">
            <h2 className="text-xl font-bold text-text-primary mb-5">Личные данные</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="profile-name" className="block text-sm text-text-muted mb-1.5">Имя</label>
                <input
                  id="profile-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-border text-sm text-text-primary bg-surface-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
              <div>
                <label htmlFor="profile-email" className="block text-sm text-text-muted mb-1.5">Email</label>
                <input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-border text-sm text-text-primary bg-surface-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
            </div>

            {profileError && (
              <div className="flex items-center gap-2 mb-4 text-sm text-red-500">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                {profileError}
              </div>
            )}

            {profileToast && (
              <div className="flex items-center gap-2 mb-4 text-sm text-emerald-600 dark:text-emerald-400">
                <FiCheck className="w-4 h-4 shrink-0" />
                {profileToast.text}
              </div>
            )}

            <button
              onClick={handleSaveProfile}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
            >
              Сохранить изменения
            </button>
          </div>

          {/* Password change card */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_5px_24px_var(--color-shadow)]">
            <h2 className="text-xl font-bold text-text-primary mb-5">Изменение пароля</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor="pwd-current" className="block text-sm text-text-muted mb-1.5">Текущий пароль</label>
                <input
                  id="pwd-current"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-11 px-3 pr-10 rounded-lg border border-border text-sm text-text-primary bg-surface-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="pwd-new" className="block text-sm text-text-muted mb-1.5">Новый пароль</label>
                <input
                  id="pwd-new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-11 px-3 pr-10 rounded-lg border border-border text-sm text-text-primary bg-surface-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="pwd-confirm" className="block text-sm text-text-muted mb-1.5">Повтор нового пароля</label>
                <input
                  id="pwd-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 px-3 pr-10 rounded-lg border border-border text-sm text-text-primary bg-surface-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {passwordError && (
              <div className="flex items-center gap-2 mb-4 text-sm text-red-500">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-2 mb-4 text-sm text-emerald-600 dark:text-emerald-400">
                <FiCheck className="w-4 h-4 shrink-0" />
                {passwordSuccess}
              </div>
            )}

            <button
              onClick={handlePasswordChange}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary-hover transition-colors"
            >
              Изменить пароль
            </button>
          </div>

          {/* Delete profile card */}
          <div className="rounded-2xl border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-950/20 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="shrink-0 w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                <FiTrash2 className="w-7 h-7 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-text-primary mb-1">Удаление профиля</h2>
                <p className="text-sm text-text-muted">
                  Ваш аккаунт и все связанные с ним персональные данные будут удалены безвозвратно. Это действие нельзя отменить.
                </p>
              </div>
              <div className="shrink-0">
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                    >
                      Да, удалить
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-primary hover:bg-surface-3 transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-6 py-2.5 rounded-lg border border-red-500 text-red-500 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    Удалить профиль
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
