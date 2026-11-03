import { useState, useEffect, useCallback, useRef } from 'react'
import { FiX, FiEye, FiEyeOff } from 'react-icons/fi'
import { useAccountStore } from '../stores/accountStore'
import { z } from 'zod'

type Mode = 'login' | 'register'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultMode?: Mode
}

// ─── Validation schemas ──────────────────────────────────────────
const loginSchema = z.object({
  identifier: z.string().min(1, 'Введите email или имя пользователя'),
  password: z.string().min(1, 'Введите пароль'),
})

const registerSchema = z.object({
  email: z.string().email('Неверный формат email').min(1, 'Введите email'),
  username: z.string().min(2, 'Минимум 2 символа').min(1, 'Введите имя пользователя'),
  password: z.string().min(4, 'Минимум 4 символа'),
  confirmPassword: z.string().min(4, 'Минимум 4 символа'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
})

// ─── Password input with visibility toggle ───────────────────────
function PasswordInput({
  value,
  onChange,
  error,
  label,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
  label: string
}) {
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1.5">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full h-11 px-3 pr-10 rounded-lg border text-sm text-text-primary bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${error ? 'border-red-500' : 'border-border'}`}
          placeholder={label === 'Пароль' || label === 'Повторите пароль' ? 'Введите пароль' : 'Введите пароль'}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          tabIndex={-1}
        >
          {visible ? <FiEye className="w-4 h-4" /> : <FiEyeOff className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Auth Modal ──────────────────────────────────────────────────
export function AuthModal({ isOpen, onClose, defaultMode = 'login' }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const modalRef = useRef<HTMLDivElement>(null)

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [regEmail, setRegEmail] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [regErrors, setRegErrors] = useState<Record<string, string>>({})
  const [regLoading, setRegLoading] = useState(false)

  const register = useAccountStore((s) => s.register)
  const login = useAccountStore((s) => s.login)

  // Reset mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode)
    }
  }, [isOpen, defaultMode])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Close on outside click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  // Login submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = loginSchema.safeParse({ identifier: loginIdentifier, password: loginPassword })
    if (!result.success) {
      setLoginError(result.error.errors[0]?.message || '')
      return
    }
    setLoginError('')
    setLoginLoading(true)
    const res = await login(result.data.identifier, result.data.password)
    if (res.success) {
      setLoginIdentifier('')
      setLoginPassword('')
      setLoginError('')
      onClose()
    } else {
      setLoginError(res.error)
    }
    setLoginLoading(false)
  }

  // Register submit
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = registerSchema.safeParse({
      email: regEmail,
      username: regUsername,
      password: regPassword,
      confirmPassword: regConfirmPassword,
    })
    if (!result.success) {
      const errors: Record<string, string> = {}
      // Zod v4 uses issues instead of errors
      const issues = result.error.issues || result.error.errors || []
      for (const err of issues) {
        if (err.path && err.path[0]) errors[String(err.path[0])] = err.message
      }
      setRegErrors(errors)
      return
    }
    setRegErrors({})
    setRegLoading(true)
    const res = await register(result.data.email, result.data.username, result.data.username, result.data.password)
    if (res.success) {
      setRegEmail('')
      setRegUsername('')
      setRegPassword('')
      setRegConfirmPassword('')
      onClose()
    } else {
      setRegErrors({ form: res.error })
    }
    setRegLoading(false)
  }

  // Switch mode
  const switchMode = (m: Mode) => {
    setMode(m)
    setLoginError('')
    setRegErrors({})
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-[440px] mx-4 rounded-2xl bg-surface border border-border shadow-[0_20px_60px_rgba(0,0,0,.3)] dark:bg-surface-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          aria-label="Закрыть"
        >
          <FiX className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="px-8 pt-8 pb-4">
          <h2 className="text-2xl font-bold text-text-primary">{mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h2>
        </div>

        {/* Content */}
        <div className="px-8 pb-8">
          {mode === 'login' ? (
            /* ── Login form ── */
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Email или имя пользователя</label>
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => { setLoginIdentifier(e.target.value); setLoginError('') }}
                  className={`w-full h-11 px-3 rounded-lg border text-sm text-text-primary bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${loginError ? 'border-red-500' : 'border-border'}`}
                  placeholder="Введите логин или email"
                  autoFocus
                />
                {loginError && <p className="mt-1 text-xs text-red-500">{loginError}</p>}
              </div>

              <PasswordInput
                value={loginPassword}
                onChange={setLoginPassword}
                error={loginError}
                label="Пароль"
              />

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full h-12 rounded-lg bg-primary text-white font-semibold text-base hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed !bg-[var(--color-primary)] hover:!bg-[var(--color-primary-hover)]"
              >
                {loginLoading ? 'Вход...' : 'Войти'}
              </button>

              <p className="text-center text-sm text-text-muted">
                Нет аккаунта?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="text-primary hover:underline font-medium"
                >
                  Зарегистрироваться
                </button>
              </p>
            </form>
          ) : (
            /* ── Register form ── */
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              {regErrors.form && (
                <p className="text-sm text-red-500">{regErrors.form}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => { setRegEmail(e.target.value); setRegErrors((p) => ({ ...p, email: '' })) }}
                  className={`w-full h-11 px-3 rounded-lg border text-sm text-text-primary bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${regErrors.email ? 'border-red-500' : 'border-border'}`}
                  placeholder="Введите email"
                  autoFocus
                />
                {regErrors.email && <p className="mt-1 text-xs text-red-500">{regErrors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">Имя пользователя</label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => { setRegUsername(e.target.value); setRegErrors((p) => ({ ...p, username: '' })) }}
                  className={`w-full h-11 px-3 rounded-lg border text-sm text-text-primary bg-surface placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all ${regErrors.username ? 'border-red-500' : 'border-border'}`}
                  placeholder="Введите имя пользователя"
                />
                {regErrors.username && <p className="mt-1 text-xs text-red-500">{regErrors.username}</p>}
              </div>

              <PasswordInput
                value={regPassword}
                onChange={setRegPassword}
                error={regErrors.password}
                label="Пароль"
              />

              <PasswordInput
                value={regConfirmPassword}
                onChange={setRegConfirmPassword}
                error={regErrors.confirmPassword}
                label="Повторите пароль"
              />

              <button
                type="submit"
                disabled={regLoading}
                className="w-full h-12 rounded-lg bg-primary text-white font-semibold text-base hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed !bg-[var(--color-primary)] hover:!bg-[var(--color-primary-hover)]"
              >
                {regLoading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>

              <p className="text-center text-sm text-text-muted">
                Уже есть аккаунт?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-primary hover:underline font-medium"
                >
                  Войти
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
