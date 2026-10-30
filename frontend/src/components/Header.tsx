import { useRef, useEffect, useCallback, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useCartStore } from '../stores/cartStore'
import { FiMenu, FiSearch, FiShoppingCart, FiChevronDown, FiX } from 'react-icons/fi'
import { Link } from 'react-router'
import logo from '../assets/home/logo-pc-builder.png'
import placeholder from '../assets/placeholder.jpg'
import { NavigationMenu } from './NavigationMenu'
import { SearchDropdown } from './SearchDropdown'
import { ProfileDropdown } from './ProfileDropdown'

const DROPDOWN_GAP = 8

const DEMO_USER = {
  name: 'Анна Петрова',
  email: 'anna.petrova@mail.ru',
  avatar: placeholder,
}

export function Header() {
  const { navOpen, searchOpen, profileOpen, toggleNav, toggleSearch, toggleProfile, closeSearch, setSearchQuery, searchQuery, closeNav, closeProfile } =
    useUIStore()
  const totalItems = useCartStore((s) => s.totalItems())
  const headerRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const navTriggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLDivElement>(null)
  const profileTriggerRef = useRef<HTMLDivElement>(null)
  const [navPos, setNavPos] = useState<{ top: number }>({ top: 0 })
  const [searchPos, setSearchPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const [profilePos, setProfilePos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const computeDropdownPositions = useCallback(() => {
    if (!headerRef.current) return
    const headerRect = headerRef.current.getBoundingClientRect()
    const top = headerRect.bottom + DROPDOWN_GAP

    if (navTriggerRef.current) {
      const rect = navTriggerRef.current.getBoundingClientRect()
      setNavPos({ top: rect.bottom + DROPDOWN_GAP })
    } else {
      setNavPos({ top })
    }

    if (searchInputRef.current) {
      const rect = searchInputRef.current.getBoundingClientRect()
      setSearchPos({ top, left: rect.left, width: rect.width })
    } else {
      setSearchPos({ top, left: 0, width: 0 })
    }

    if (profileTriggerRef.current) {
      const avatarEl = profileTriggerRef.current.querySelector('button')
      if (avatarEl) {
        const avatarRect = avatarEl.getBoundingClientRect()
        // We need the menu width; calculate it on open
        setProfilePos({ top, left: 0 })
      }
    }
  }, [])

  useEffect(() => {
    if (navOpen) computeDropdownPositions()
  }, [navOpen, computeDropdownPositions])

  useEffect(() => {
    if (searchOpen) computeDropdownPositions()
  }, [searchOpen, computeDropdownPositions])

  useEffect(() => {
    if (profileOpen) computeDropdownPositions()
  }, [profileOpen, computeDropdownPositions])

  const computeProfilePosition = useCallback((menuWidth: number) => {
    if (!profileTriggerRef.current) return { top: 0, left: 0 }
    const avatarEl = profileTriggerRef.current.querySelector('button')
    if (!avatarEl) return { top: 0, left: 0 }
    const avatarRect = avatarEl.getBoundingClientRect()
    const headerRect = headerRef.current?.getBoundingClientRect()
    const top = headerRect?.bottom + DROPDOWN_GAP ?? avatarRect.bottom + DROPDOWN_GAP
    const left = avatarRect.left + avatarRect.width / 2 - menuWidth / 2
    return { top, left }
  }, [])

  const handleProfileOpen = useCallback(() => {
    toggleProfile()
    // Delay position computation until the dropdown is rendered
    requestAnimationFrame(() => {
      const menuEl = document.querySelector('[data-testid="profile-dropdown"]')
      if (menuEl) {
        const menuWidth = menuEl.getBoundingClientRect().width
        const pos = computeProfilePosition(menuWidth)
        setProfilePos(pos)
      }
    })
  }, [toggleProfile, computeProfilePosition])

  // Close all panels when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (headerRef.current && !headerRef.current.contains(target)) {
        closeNav()
        closeSearch()
        closeProfile()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeNav, closeSearch, closeProfile])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSearch()
      searchRef.current?.blur()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = searchQuery.trim()
      if (trimmed) {
        closeSearch()
        // Navigate via Link component
        window.location.href = `/catalog?q=${encodeURIComponent(trimmed)}`
      }
    } else if (e.key === 'Tab') {
      // Allow tab to escape without closing
    }
  }, [searchQuery, closeSearch])

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border shadow-[0_1px_3px_var(--color-shadow)]"
    >
      <div className="max-w-[1320px] mx-auto px-4 h-16 flex items-center gap-4">
        {/* Hamburger */}
        <button
          onClick={toggleNav}
          className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-surface-3 transition-colors text-text-primary"
          aria-label="Открыть меню"
        >
          <FiMenu className="w-5 h-5" />
        </button>

        {/* Logo */}
        <a href="/" className="shrink-0">
          <img src={logo} alt="PC Builder" className="h-9 w-auto" />
        </a>

        {/* Search */}
        <div className="flex-1 relative">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Поиск комплектующих, сборок и аксессуаров..."
              className="w-full h-10 pl-10 pr-10 bg-surface-3 border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              onFocus={() => toggleSearch()}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery.trim() && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  searchRef.current?.focus()
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted hover:text-text-primary"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchOpen && searchQuery.trim() && <SearchDropdown />}
        </div>

        {/* Cart */}
        <Link
          to="/cart"
          className="relative w-10 h-10 flex items-center justify-center rounded-md hover:bg-surface-3 transition-colors text-text-primary"
          aria-label="Корзина"
        >
          <FiShoppingCart className="w-5 h-5" />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-medium rounded-full px-1">
              {totalItems}
            </span>
          )}
        </Link>

        {/* Profile */}
        <div className="relative shrink-0">
          <button
            onClick={toggleProfile}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
            aria-label="Профиль"
          >
            <img src={DEMO_USER.avatar} alt="" className="w-8 h-8 rounded-full" />
            <FiChevronDown className="w-3.5 h-3.5 ml-1 text-text-muted" />
          </button>

          {profileOpen && <ProfileDropdown user={DEMO_USER} />}
        </div>

        {/* Nav Menu */}
        {navOpen && <NavigationMenu onClose={toggleNav} />}
      </div>
    </header>
  )
}
