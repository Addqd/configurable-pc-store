import { useUIStore } from '../stores/uiStore'
import { useThemeStore } from '../stores/themeStore'
import { FiUser, FiBox, FiFileText, FiSettings, FiLogOut } from 'react-icons/fi'
import { HiMiniMoon, HiMiniSun } from 'react-icons/hi2'
import { Link } from 'react-router'

interface User {
  name: string
  email: string
  avatar: string
}

interface ProfileDropdownProps {
  user: User
}

export function ProfileDropdown({ user }: ProfileDropdownProps) {
  const { closeProfile } = useUIStore()
  const { isDark, toggle } = useThemeStore()

  const MENU_ITEMS = [
    { label: 'Личный кабинет', icon: FiUser, to: '/account' },
    { label: 'Мои сборки', icon: FiBox, to: null, stub: true },
    { label: 'Мои заказы', icon: FiFileText, to: null, stub: true },
    { label: 'Настройки', icon: FiSettings, to: null, stub: true },
  ]

  const handleMenuClick = () => {
    closeProfile()
  }

  return (
    <div
      className="absolute top-full right-0 mt-2 w-[280px] bg-surface rounded-xl border border-border shadow-[0_8px_30px_var(--color-shadow-md)] z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {/* User info */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">{user.name}</p>
            <p className="text-xs text-text-muted">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      {MENU_ITEMS.map((item) => (
        item.to ? (
          <Link
            key={item.label}
            to={item.to}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-3 hover:text-primary transition-colors"
            onClick={handleMenuClick}
          >
            <item.icon className="w-5 h-5 text-text-muted" />
            <span>{item.label}</span>
          </Link>
        ) : (
          <button
            key={item.label}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-surface-3 hover:text-primary transition-colors"
            onClick={handleMenuClick}
          >
            <item.icon className="w-5 h-5 text-text-muted" />
            <span>{item.label}</span>
            <span className="text-xs ml-auto">(скоро)</span>
          </button>
        )
      ))}

      {/* Dark theme toggle */}
      <div className="px-4 py-2 border-t border-border">
        <button
          className="w-full flex items-center justify-between px-1 py-2.5 text-sm text-text-primary hover:bg-surface-3 hover:text-primary transition-colors rounded-lg"
          onClick={toggle}
        >
          <div className="flex items-center gap-3">
            {isDark ? (
              <HiMiniSun className="w-5 h-5 text-text-muted" />
            ) : (
              <HiMiniMoon className="w-5 h-5 text-text-muted" />
            )}
            <span>Тёмная тема</span>
          </div>
          <div
            className={`w-9 h-5 rounded-full relative transition-colors ${isDark ? 'bg-primary' : 'bg-surface-3 border border-border'}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-[20px]' : 'translate-x-0.5'}`}
            />
          </div>
        </button>
      </div>

      {/* Separator and Logout */}
      <div className="border-t border-border">
        <button
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-surface-3 hover:text-primary transition-colors"
          onClick={() => {
            closeProfile()
          }}
        >
          <FiLogOut className="w-5 h-5" />
          <span>Выйти из аккаунта (демо-режим, вход не реализован)</span>
        </button>
      </div>
    </div>
  )
}
