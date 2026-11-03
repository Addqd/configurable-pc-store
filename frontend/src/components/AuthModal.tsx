import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FiX, FiEye, FiEyeOff } from 'react-icons/fi'
import { z } from 'zod'
import { useAccountStore } from '../stores/accountStore'

type Mode = 'login' | 'register'
interface AuthModalProps { isOpen: boolean; onClose: () => void; defaultMode?: Mode }

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Введите email или имя пользователя'),
  password: z.string().min(1, 'Введите пароль'),
})
const registerSchema = z.object({
  email: z.string().email('Неверный формат email'),
  username: z.string().trim().min(2, 'Минимум 2 символа'),
  password: z.string().min(8, 'Минимум 8 символов'),
  confirmPassword: z.string().min(1, 'Повторите пароль'),
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'], message: 'Пароли не совпадают',
})

type PasswordInputProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  autoComplete: string
  placeholder?: string
}

function PasswordInput({ id, label, value, onChange, error, autoComplete, placeholder }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      <div className="relative">
        <input
          id={id} type={visible ? 'text' : 'password'} value={value} autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          className={`w-full h-11 px-3 pr-10 rounded-lg border text-sm text-text-primary bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${error ? 'border-red-500' : 'border-border'}`}
          placeholder={placeholder ?? 'Введите пароль'}
        />
        <button
          type="button" onClick={() => setVisible((previous) => !previous)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          aria-label={visible ? `Скрыть: ${label}` : `Показать: ${label}`}
        >
          {visible ? <FiEye className="w-4 h-4" /> : <FiEyeOff className="w-4 h-4" />}
        </button>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function AuthModal({ isOpen, onClose, defaultMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const modalRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const [identifier, setIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const register = useAccountStore((s) => s.register)
  const login = useAccountStore((s) => s.login)

  useEffect(() => {
    if (isOpen) setMode(defaultMode)
  }, [defaultMode, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const focusedBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstInputRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Tab' && modalRef.current) {
        const items = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]'))
          .filter((element) => element.getClientRects().length > 0)
        const first = items[0]
        const last = items[items.length - 1]
        if (!first || !last) return
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
      focusedBeforeOpen?.focus()
    }
  }, [isOpen, onClose])

  const switchMode = (next: Mode) => {
    setMode(next)
    setLoginError('')
    setErrors({})
    setLoading(false)
    setLoginPassword('')
    setPassword('')
    setConfirmPassword('')
    // The input itself is re-created when the active form changes.
    requestAnimationFrame(() => firstInputRef.current?.focus())
  }

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    const parsed = loginSchema.safeParse({ identifier, password: loginPassword })
    if (!parsed.success) { setLoginError(parsed.error.issues[0]?.message || 'Проверьте данные'); return }
    setLoginError('')
    setLoading(true)
    try {
      const result = await login(parsed.data.identifier, parsed.data.password)
      if (!result.success) { setLoginError(result.error); return }
      setLoginPassword('')
      setIdentifier('')
      onClose()
    } catch { setLoginError('Не удалось выполнить вход') }
    finally { setLoading(false) }
  }

  const submitRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    const parsed = registerSchema.safeParse({ email, username, password, confirmPassword })
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        if (!nextErrors[field]) nextErrors[field] = issue.message
      }
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      const result = await register(parsed.data.email, parsed.data.username, parsed.data.username, parsed.data.password)
      if (!result.success) { setErrors({ form: result.error }); return }
      setEmail(''); setUsername(''); setPassword(''); setConfirmPassword('')
      onClose()
    } catch { setErrors({ form: 'Не удалось завершить регистрацию' }) }
    finally { setLoading(false) }
  }

  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/55 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="auth-title"
        className="relative w-full max-w-[440px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl bg-surface border border-border shadow-[0_20px_60px_rgba(0,0,0,.3)]"
      >
        <button
          type="button" onClick={onClose} aria-label="Закрыть"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
        ><FiX className="w-5 h-5" /></button>
        <div className="px-7 sm:px-8 pt-8 pb-4">
          <h2 id="auth-title" className="text-2xl font-bold text-text-primary">
            {mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
          </h2>
        </div>
        <div className="px-7 sm:px-8 pb-8">
          {mode === 'login' ? (
            <form onSubmit={submitLogin} className="space-y-4" noValidate>
              <div>
                <label htmlFor="login-identifier" className="block text-sm font-medium text-text-primary mb-1.5">Email или имя пользователя</label>
                <input
                  ref={firstInputRef} id="login-identifier" type="text" autoComplete="username" value={identifier}
                  onChange={(event) => { setIdentifier(event.target.value); setLoginError('') }}
                  placeholder="Введите логин или email"
                  className="w-full h-11 px-3 rounded-lg border border-border text-sm text-text-primary bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <PasswordInput
                id="login-password" label="Пароль" value={loginPassword} autoComplete="current-password"
                onChange={(v) => { setLoginPassword(v); setLoginError('') }}
              />
              {loginError && <p role="alert" className="text-sm text-red-500">{loginError}</p>}
              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-lg bg-primary text-white font-semibold text-base hover:bg-primary-hover transition-colors disabled:opacity-50"
              >{loading ? 'Вход...' : 'Войти'}</button>
              <p className="text-center text-sm text-text-muted">Нет аккаунта?{' '}
                <button type="button" onClick={() => switchMode('register')} className="text-primary hover:underline font-medium">Зарегистрироваться</button>
              </p>
            </form>
          ) : (
            <form onSubmit={submitRegister} className="space-y-4" noValidate>
              {errors.form && <p role="alert" className="text-sm text-red-500">{errors.form}</p>}
              <div>
                <label htmlFor="registration-email" className="block text-sm font-medium text-text-primary mb-1.5">Email</label>
                <input
                  ref={firstInputRef} id="registration-email" type="email" autoComplete="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((previous) => ({ ...previous, email: '' })) }}
                  placeholder="Введите email" aria-invalid={Boolean(errors.email)}
                  className={`w-full h-11 px-3 rounded-lg border bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary ${errors.email ? 'border-red-500' : 'border-border'}`}
                />
                {errors.email && <p role="alert" className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>
              <div>
                <label htmlFor="registration-username" className="block text-sm font-medium text-text-primary mb-1.5">Имя пользователя</label>
                <input
                  id="registration-username" type="text" autoComplete="username" value={username}
                  onChange={(e) => { setUsername(e.target.value); setErrors((previous) => ({ ...previous, username: '' })) }}
                  placeholder="Введите имя пользователя" aria-invalid={Boolean(errors.username)}
                  className={`w-full h-11 px-3 rounded-lg border bg-surface text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary ${errors.username ? 'border-red-500' : 'border-border'}`}
                />
                {errors.username && <p role="alert" className="mt-1 text-xs text-red-500">{errors.username}</p>}
              </div>
              <PasswordInput id="registration-password" label="Пароль" value={password} autoComplete="new-password" error={errors.password}
                onChange={(v) => { setPassword(v); setErrors((previous) => ({ ...previous, password: '' })) }} />
              <PasswordInput id="registration-confirm-password" label="Повторите пароль" value={confirmPassword}
                autoComplete="new-password" placeholder="Повторите пароль" error={errors.confirmPassword}
                onChange={(v) => { setConfirmPassword(v); setErrors((previous) => ({ ...previous, confirmPassword: '' })) }} />
              <button type="submit" disabled={loading}
                className="w-full h-12 rounded-lg bg-primary text-white font-semibold text-base hover:bg-primary-hover transition-colors disabled:opacity-50"
              >{loading ? 'Регистрация...' : 'Зарегистрироваться'}</button>
              <p className="text-center text-sm text-text-muted">Уже есть аккаунт?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-primary hover:underline font-medium">Войти</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
