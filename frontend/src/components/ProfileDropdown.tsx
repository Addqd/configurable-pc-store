import { useUIStore } from '../stores/uiStore'
import { useThemeStore } from '../stores/themeStore'
import { useAccountStore } from '../stores/accountStore'
import { FiUser, FiBox, FiFileText, FiSettings, FiLogOut } from 'react-icons/fi'
import { HiMiniMoon, HiMiniSun } from 'react-icons/hi2'
import { Link } from 'react-router'
import placeholder from '../assets/placeholder.jpg'

type User = { name: string; email: string; avatar: string }
interface ProfileDropdownProps { user?: User | null; onLogout?: () => void }

export function ProfileDropdown({ user, onLogout }: ProfileDropdownProps) {
  const closeProfile = useUIStore((s) => s.closeProfile)
  const { isDark, toggle } = useThemeStore()
  const defaultLogout = useAccountStore((s) => s.logout)
  const avatarUrl = user?.avatar || placeholder
  const MENU_ITEMS = [
    { label: 'Личный кабинет', icon: FiUser, to: '/account' },
    { label: 'Мои заказы', icon: FiFileText, to: '/account/orders' },
    { label: 'Настройки', icon: FiSettings, to: '/account' },
  ]
  return (
    <div
      className="w-[280px] max-w-[calc(100vw-16px)] bg-surface rounded-xl border border-border shadow-[0_8px_30px_var(--color-shadow-md)] py-2"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {user && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl} alt={user.name} onError={(e) => { e.currentTarget.src = placeholder }}
              className="w-10 h-10 rounded-full shrink-0 object-cover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-xs text-text-muted truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}
      <Link
        to="/account" onClick={closeProfile}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-3 hover:text-primary transition-colors"
      ><FiUser className="w-5 h-5 text-text-muted" /><span>Личный кабинет</span></Link>
      <Link
        to="/builds" onClick={closeProfile}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-3 hover:text-primary transition-colors"
      ><FiBox className="w-5 h-5 text-text-muted" /><span>Мои сборки</span></Link>
      {MENU_ITEMS.slice(1).map((item) => (
        <Link
          key={item.label} to={item.to} onClick={closeProfile}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-3 hover:text-primary transition-colors"
        ><item.icon className="w-5 h-5 text-text-muted"/><span>{item.label}</span></Link>
      ))}
      <div className="px-4 py-2 border-t border-border">
        <button
          type="button"
          className="w-full flex items-center justify-between px-1 py-2.5 text-sm text-text-primary hover:bg-surface-3 hover:text-primary transition-colors rounded-lg"
          onClick={toggle}
          aria-label="Переключить тёмную тему"
          aria-pressed={isDark}
        >
          <span className="flex items-center gap-3">
            {isDark ? <HiMiniSun className="w-5 h-5 text-text-muted" /> : <HiMiniMoon className="w-5 h-5 text-text-muted" />}
            Тёмная тема
          </span>
          <span aria-hidden="true" className={`relative inline-block w-9 h-5 shrink-0 overflow-hidden rounded-full transition-colors ${isDark ? 'bg-primary' : 'bg-surface-3 border border-border'}`}>
            <span className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`} />
          </span>
        </button>
      </div>
      <div className="border-t border-border">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-surface-3 hover:text-primary transition-colors"
          onClick={() => { closeProfile(); (onLogout ?? defaultLogout)() }}
        ><FiLogOut className="w-5 h-5" /><span>Выйти из аккаунта</span></button>
      </div>
    </div>
  )
}
