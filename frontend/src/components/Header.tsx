import { useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useCartStore } from '../stores/cartStore'
import { FiMenu, FiSearch, FiShoppingCart, FiChevronDown, FiX } from 'react-icons/fi'
import { Link } from 'react-router'
import logo from '../assets/home/logo-pc-builder.png'
import placeholder from '../assets/placeholder.jpg'
import { NavigationMenu } from './NavigationMenu'
import { SearchDropdown } from './SearchDropdown'
import { ProfileDropdown } from './ProfileDropdown'
import { HeaderPopup } from './HeaderPopup'

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
  const navButtonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLImageElement>(null)

  // Close all panels when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const insideHeader = headerRef.current?.contains(target)
      const insidePopup = target.closest('[data-header-popup]')

      if (insideHeader || insidePopup) return

      closeNav()
      closeSearch()
      closeProfile()
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
          ref={navButtonRef}
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
              ref={searchInputRef}
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
            <img
              ref={avatarRef}
              src={DEMO_USER.avatar}
              alt=""
              className="w-8 h-8 rounded-full"
            />
            <FiChevronDown className="w-3.5 h-3.5 ml-1 text-text-muted" />
          </button>
        </div>

        {/* Nav Menu */}
        {navOpen && (
          <HeaderPopup
            headerRef={headerRef}
            anchorRef={navButtonRef}
            placement="start"
            testId="navigation-popup"
          >
            <NavigationMenu onClose={toggleNav} />
          </HeaderPopup>
        )}

        {searchOpen && (
          <HeaderPopup
            headerRef={headerRef}
            anchorRef={searchInputRef}
            placement="stretch"
            testId="search-popup"
          >
            <SearchDropdown />
          </HeaderPopup>
        )}

        {profileOpen && (
          <HeaderPopup
            headerRef={headerRef}
            anchorRef={avatarRef}
            placement="center"
            testId="profile-popup"
          >
            <ProfileDropdown user={DEMO_USER} />
          </HeaderPopup>
        )}
      </div>
    </header>
  )
}
