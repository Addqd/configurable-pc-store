import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import { useAccountStore, selectActiveAccount } from '../stores/accountStore'
import { useCartStore } from '../stores/cartStore'
import { useUIStore } from '../stores/uiStore'
import { countAccountReviews, REVIEWS_UPDATED_EVENT } from '../data/reviewStorage'
import placeholder from '../assets/placeholder.jpg'
import { FiCamera, FiCheck, FiAlertCircle, FiTrash2, FiShoppingCart, FiMessageSquare, FiEye, FiEyeOff } from 'react-icons/fi'
import { Link } from 'react-router'

function PasswordField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm text-text-muted mb-1.5">{label}</label>
      <div className="relative">
        <input
          id={id} type={visible ? 'text' : 'password'} autoComplete={id === 'pwd-current' ? 'current-password' : 'new-password'}
          value={value} onChange={(e) => onChange(e.target.value)} placeholder="••••••••"
          className="w-full h-11 px-3 pr-10 rounded-lg border border-border text-sm text-text-primary bg-surface-2 placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
        />
        <button
          type="button" onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-3"
          aria-label={visible ? `Скрыть: ${label}` : `Показать: ${label}`}
        >{visible ? <FiEye className="w-4 h-4" /> : <FiEyeOff className="w-4 h-4" />}</button>
      </div>
    </div>
  )
}

async function imageToAvatar(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Можно загрузить только JPG, PNG или WebP')
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Изображение должно быть меньше 5 МБ')
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Файл изображения повреждён'))
      image.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Невозможно обработать изображение')
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    context.drawImage(image,
      (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side,
      0, 0, 256, 256)
    return canvas.toDataURL('image/jpeg', 0.78)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function AccountContent() {
  const account = useAccountStore(selectActiveAccount)
  const updateProfile = useAccountStore((s) => s.updateProfile)
  const setAvatar = useAccountStore((s) => s.setAvatar)
  const changePassword = useAccountStore((s) => s.changePassword)
  const deleteAccount = useAccountStore((s) => s.deleteAccount)
  const openAuthModal = useUIStore((s) => s.openAuthModal)
  const orders = useCartStore((s) => s.orders)
  const [reviewCount, setReviewCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setName(account?.displayName ?? '')
    setEmail(account?.email ?? '')
  }, [account?.id, account?.displayName, account?.email])

  useEffect(() => {
    const refresh = () => setReviewCount(account ? countAccountReviews(account.id) : 0)
    refresh()
    window.addEventListener(REVIEWS_UPDATED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(REVIEWS_UPDATED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [account?.id])

  if (!account) {
    return (
      <main className="min-h-screen pt-24 px-4 bg-surface-2">
        <div className="mx-auto w-full max-w-[1120px]">
          <BackButton className="mb-5" />
          <div className="max-w-md mx-auto w-full h-fit rounded-2xl border border-border bg-surface p-8 text-center shadow-[0_5px_24px_var(--color-shadow)]">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Личный кабинет</h1>
          <p className="text-text-muted mb-6">Войдите в аккаунт, чтобы управлять профилем и заказами.</p>
          <button type="button" onClick={() => openAuthModal('login')}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">Войти</button>
          </div>
        </div>
      </main>
    )
  }

  const purchaseCount = orders.filter((order) => order.ownerId === account.id).length

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileMessage('')
    setProfileError('')
    const result = updateProfile({ displayName: name, email })
    if (result.success) setProfileMessage('Личные данные сохранены')
    else setProfileError(result.error)
  }

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (changingPassword) return
    setPasswordMessage(''); setPasswordError('')
    if (newPassword !== repeatPassword) { setPasswordError('Новые пароли не совпадают'); return }
    setChangingPassword(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      if (result.success) {
        setCurrentPassword(''); setNewPassword(''); setRepeatPassword('')
        setPasswordMessage('Пароль изменён')
      } else setPasswordError(result.error)
    } catch { setPasswordError('Не удалось изменить пароль') }
    finally { setChangingPassword(false) }
  }

  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarError('')
    // File decoding is asynchronous. Never apply an old account's avatar to
    // a different account if the user logs out or switches sessions meanwhile.
    const uploadingFor = account?.id
    try {
      const image = await imageToAvatar(file)
      if (!uploadingFor || useAccountStore.getState().activeAccountId !== uploadingFor) return
      if (!setAvatar(image)) setAvatarError('Не удалось сохранить аватар')
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : 'Не удалось загрузить аватар')
    }
  }

  return (
    <main className="min-h-screen bg-surface-2 px-4 pt-24 pb-12">
      <div className="max-w-[1120px] mx-auto space-y-5">
        <BackButton />
        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-[0_5px_24px_var(--color-shadow)]">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <img src={account.avatar || placeholder} alt={account.displayName}
              onError={(e) => { e.currentTarget.src = placeholder }}
              className="w-36 h-36 rounded-full object-cover bg-surface-3 shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-text-primary mb-3">Личный кабинет</h1>
              <p className="text-xl font-semibold text-text-primary">{account.displayName}</p>
              <p className="text-base text-text-muted mt-1 mb-4 break-all">{account.email}</p>
              <button type="button" onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-text-primary hover:bg-surface-3 hover:text-primary transition-colors">
                <FiCamera className="w-5 h-5" />Изменить аватар
              </button>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={changeAvatar} aria-label="Выбрать файл аватара" />
              {avatarError && <p className="text-sm text-red-500 mt-2" role="alert">{avatarError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
              <Link to="/account/orders" className="min-w-0 lg:w-[160px] rounded-xl border border-border bg-surface-2 p-5 hover:border-primary transition-colors">
                <span className="flex items-center justify-center w-14 h-14 mb-3 rounded-full bg-primary/10 text-primary"><FiShoppingCart className="w-6 h-6" /></span>
                <span className="block text-sm text-text-muted mb-1">Покупок</span>
                <strong className="block text-3xl text-text-primary">{purchaseCount}</strong>
              </Link>
              <div className="min-w-0 lg:w-[160px] rounded-xl border border-border bg-surface-2 p-5">
                <span className="flex items-center justify-center w-14 h-14 mb-3 rounded-full bg-primary/10 text-primary"><FiMessageSquare className="w-6 h-6" /></span>
                <span className="block text-sm text-text-muted mb-1">Отзывов</span>
                <strong className="block text-3xl text-text-primary">{reviewCount}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-[0_5px_24px_var(--color-shadow)]">
          <h2 className="text-2xl font-bold text-text-primary mb-5">Личные данные</h2>
          <form onSubmit={saveProfile}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              <div>
                <label htmlFor="profile-name" className="block text-sm text-text-muted mb-2">Имя</label>
                <input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 px-4 rounded-lg border border-border bg-surface-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor="profile-email" className="block text-sm text-text-muted mb-2">Email</label>
                <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-lg border border-border bg-surface-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            {profileError && <p role="alert" className="text-sm text-red-500 mb-3 flex items-center gap-2"><FiAlertCircle />{profileError}</p>}
            {profileMessage && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2"><FiCheck />{profileMessage}</p>}
            <button type="submit" className="rounded-lg px-7 py-3 bg-primary text-white dark:text-[#08090C] font-medium hover:bg-primary-hover transition-colors">Сохранить изменения</button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-[0_5px_24px_var(--color-shadow)]">
          <h2 className="text-2xl font-bold text-text-primary mb-5">Изменение пароля</h2>
          <form onSubmit={savePassword}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
              <PasswordField id="pwd-current" label="Текущий пароль" value={currentPassword} onChange={setCurrentPassword} />
              <PasswordField id="pwd-new" label="Новый пароль" value={newPassword} onChange={setNewPassword} />
              <PasswordField id="pwd-confirm" label="Повтор нового пароля" value={repeatPassword} onChange={setRepeatPassword} />
            </div>
            {passwordError && <p role="alert" className="text-sm text-red-500 mb-3 flex items-center gap-2"><FiAlertCircle />{passwordError}</p>}
            {passwordMessage && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2"><FiCheck />{passwordMessage}</p>}
            <button type="submit" disabled={changingPassword}
              className="rounded-lg px-7 py-3 bg-primary text-white dark:text-[#08090C] font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors">Изменить пароль</button>
          </form>
        </section>

        <section className="rounded-xl border border-red-400 bg-red-50/60 dark:bg-red-950/20 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/20 shrink-0 flex items-center justify-center">
              <FiTrash2 className="w-7 h-7 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-text-primary">Удаление профиля</h2>
              <p className="text-sm text-text-muted mt-1">Ваш демонстрационный аккаунт и связанные с ним персональные данные будут удалены. Это действие нельзя отменить.</p>
            </div>
            {showDeleteConfirm ? (
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => { deleteAccount(); setShowDeleteConfirm(false) }}
                  className="rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700">Да, удалить</button>
                <button type="button" onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm text-text-primary hover:bg-surface-3">Отмена</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg border border-red-500 px-5 py-2.5 text-sm font-medium text-red-500 hover:bg-red-100 dark:hover:bg-red-950/30">Удалить профиль</button>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export function AccountPage() {
  // Switching/logging out of accounts must discard the previous account's
  // unsaved form fields, password inputs and pending deletion confirmation.
  const accountId = useAccountStore((state) => state.activeAccountId)
  return <div className="min-h-screen bg-surface-2"><Header /><AccountContent key={accountId ?? 'guest'} /><Footer /></div>
}
