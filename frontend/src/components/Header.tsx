import { LanguageSwitcher } from './LanguageSwitcher'
import { useTranslation } from 'react-i18next'
import { useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useServerCart } from '../api/useServerCart'
import { useAccountStore, selectActiveAccount } from '../stores/accountStore'
import { FiMenu, FiSearch, FiShoppingCart, FiChevronDown, FiX } from 'react-icons/fi'
import { Link, useNavigate } from 'react-router'
import logo from '../assets/home/logo-pc-builder.png'
import placeholder from '../assets/placeholder.jpg'
import { NavigationMenu } from './NavigationMenu'
import { SearchDropdown } from './SearchDropdown'
import { ProfileDropdown } from './ProfileDropdown'
import { HeaderPopup } from './HeaderPopup'

/** Each page already renders its Header; authentication is shared through stores. */
export function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    navOpen, searchOpen, profileOpen, toggleNav, openSearch, toggleProfile,
    closeSearch, setSearchQuery, searchQuery, closeNav, closeProfile, openAuthModal,
  } = useUIStore()
  const account = useAccountStore(selectActiveAccount)
  const logout = useAccountStore((s) => s.logout)
  const { cart } = useServerCart()
  const totalItems = cart.data?.item_count ?? 0
  const headerRef = useRef<HTMLElement>(null)
  const navButtonRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (headerRef.current?.contains(target) || target.closest('[data-header-popup]')) return
      closeNav()
      closeSearch()
      closeProfile()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [closeNav, closeSearch, closeProfile])

  useEffect(() => {
    if (!account) closeProfile()
  }, [account, closeProfile])

  const handleSearchKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSearch()
      searchInputRef.current?.blur()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = searchQuery.trim()
      if (trimmed) {
        closeSearch()
        navigate(`/catalog?q=${encodeURIComponent(trimmed)}`)
      }
    }
  }, [searchQuery, closeSearch, navigate])

  const currentUser = account
    ? { name: account.displayName, email: account.email, avatar: account.avatar || placeholder }
    : null

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border shadow-[0_1px_3px_var(--color-shadow)]"
    >
      <div className="max-w-[1320px] mx-auto px-4 h-16 flex items-center gap-4">
        <button
          ref={navButtonRef}
          onClick={toggleNav}
          className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-surface-3 transition-colors text-text-primary"
          aria-label={t('header.menu_label')}
        >
          <FiMenu className="w-5 h-5" />
        </button>
        <Link to="/" className="shrink-0 flex items-center gap-2" onClick={() => { closeNav(); closeProfile() }}>
          <img src={logo} alt="PC Builder" className="h-9 w-auto" />
        </Link>
        <div className="flex-1 relative min-w-0">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('header.search_placeholder')}
              className="w-full h-10 pl-10 pr-10 bg-surface-3 border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              onFocus={openSearch}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery.trim() && (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted hover:text-text-primary"
                aria-label={t('header.search_clear')}
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <LanguageSwitcher />
        <Link
          to="/cart"
          className="relative w-10 h-10 flex items-center justify-center rounded-md hover:bg-surface-3 transition-colors text-text-primary"
          aria-label={t('header.cart_label')}
        >
          <FiShoppingCart className="w-5 h-5" />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-white text-[10px] font-medium rounded-full px-1">
              {totalItems}
            </span>
          )}
        </Link>
        <div className="relative shrink-0">
          <button
            onClick={() => account ? toggleProfile() : openAuthModal('login')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
            aria-label={t('header.profile_label')}
          >
            <img
              ref={avatarRef}
              src={currentUser?.avatar || placeholder}
              onError={(e) => { e.currentTarget.src = placeholder }}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
            {account && <FiChevronDown className="w-3.5 h-3.5 ml-1 text-text-muted" />}
          </button>
        </div>
        {navOpen && (
          <HeaderPopup headerRef={headerRef} anchorRef={navButtonRef} placement="start" testId="navigation-popup">
            <NavigationMenu onClose={closeNav} />
          </HeaderPopup>
        )}
        {searchOpen && (
          <HeaderPopup headerRef={headerRef} anchorRef={searchInputRef} placement="stretch" testId="search-popup">
            <SearchDropdown />
          </HeaderPopup>
        )}
        {profileOpen && account && (
          <HeaderPopup headerRef={headerRef} anchorRef={avatarRef} placement="center" testId="profile-popup">
            <ProfileDropdown user={currentUser} onLogout={logout} />
          </HeaderPopup>
        )}
      </div>
    </header>
  )
}
