import { render } from '../test-utils'
import { act } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { Header } from './Header'
import { useUIStore } from '../stores/uiStore'
import { useCartStore } from '../stores/cartStore'
import { useAccountStore } from '../stores/accountStore'
import { useThemeStore } from '../stores/themeStore'

vi.mock('react-icons/fi', () => ({
  FiMenu: () => <div data-testid="fi-menu" />,
  FiSearch: () => <div data-testid="fi-search" />,
  FiShoppingCart: () => <div data-testid="fi-cart" />,
  FiChevronDown: () => <div data-testid="fi-chevron-down" />,
  FiX: () => <div data-testid="fi-x" />,
}))
vi.mock('react-icons/hi2', () => ({ HiMiniChevronRight: () => <div data-testid="hi-chevron" /> }))
vi.mock('./SearchDropdown', () => ({ SearchDropdown: () => <div data-testid="search-dropdown" /> }))
vi.mock('./ProfileDropdown', () => ({ ProfileDropdown: () => <div data-testid="profile-dropdown" /> }))
vi.mock('./NavigationMenu', () => ({ NavigationMenu: () => <div data-testid="navigation-menu" /> }))
// The two approved theme assets are mocked so the component is asserted on the
// module it resolves, not on Vite's hashed asset URL.
vi.mock('../assets/logo/pc builder logo.png', () => ({ default: 'mock-logo-light.png' }))
vi.mock('../assets/logo/pc builder logo dark.png', () => ({ default: 'mock-logo-dark.png' }))
vi.mock('../assets/placeholder.jpg', () => ({ default: 'mock-placeholder.jpg' }))

describe('Header', () => {
  beforeEach(() => {
    cleanup()
    useUIStore.setState({ navOpen: false, searchOpen: false, profileOpen: false, authModalOpen: false, searchQuery: '' })
    useAccountStore.setState({ accounts: {}, activeAccountId: null })
    useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1, activeAccountId: null })
    useThemeStore.setState({ isDark: false })
  })
  const renderHeader = () => render(<MemoryRouter><Header /></MemoryRouter>)
  const logoImage = () => screen.getByAltText('PC Builder') as HTMLImageElement

  it('renders the hamburger, logo, search, cart and profile controls', () => {
    renderHeader()
    expect(screen.getByLabelText('Открыть меню')).toBeTruthy()
    expect(screen.getByAltText('PC Builder')).toBeTruthy()
    expect(screen.getByPlaceholderText(/поиск комплектующих/i)).toBeTruthy()
    expect(screen.getByLabelText('Корзина')).toBeTruthy()
    expect(screen.getByLabelText('Профиль')).toBeTruthy()
  })

  it('opens and closes navigation', () => {
    renderHeader()
    fireEvent.click(screen.getByLabelText('Открыть меню'))
    expect(screen.getByTestId('navigation-menu')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Открыть меню'))
    expect(screen.queryByTestId('navigation-menu')).toBeNull()
  })

  it('opens login instead of pretending a guest is authenticated', () => {
    renderHeader()
    fireEvent.click(screen.getByLabelText('Профиль'))
    expect(useUIStore.getState().authModalOpen).toBe(true)
    expect(useUIStore.getState().authModalMode).toBe('login')
    expect(screen.queryByTestId('profile-dropdown')).toBeNull()
  })

  it('opens the profile dropdown for an authenticated account', () => {
    useAccountStore.setState({
      activeAccountId: 'id1',
      accounts: {
        id1: { account: { id: 'id1', email: 'a@b.com', username: 'demo', displayName: 'Demo', avatar: '', createdAt: 1 },
          password: { salt: 'salt', hash: 'hash' } },
      },
    })
    renderHeader()
    fireEvent.click(screen.getByLabelText('Профиль'))
    expect(screen.getByTestId('profile-dropdown')).toBeTruthy()
  })

  it('shows the server cart count', async () => {
    useAccountStore.setState({ activeAccountId: 'id1', accounts: { id1: { account: { id: 'id1', email: 'a@b.com', username: 'demo', displayName: 'Demo', avatar: '', createdAt: 1 } } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, items: [], subtotal: '0.00', item_count: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    renderHeader()
    expect(await screen.findByText('1')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('shows and closes the search dropdown', () => {
    renderHeader()
    const search = screen.getByPlaceholderText(/поиск комплектующих/i)
    fireEvent.focus(search)
    fireEvent.change(search, { target: { value: 'rtx' } })
    expect(screen.getByTestId('search-dropdown')).toBeTruthy()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByTestId('search-dropdown')).toBeNull()
  })

  it('renders the light logo in light theme', () => {
    renderHeader()
    expect(logoImage().getAttribute('src')).toBe('mock-logo-light.png')
    expect(logoImage().getAttribute('alt')).toBe('PC Builder')
    expect(logoImage().className).toBe('h-9 w-auto')
  })

  it('renders the dark logo in dark theme', () => {
    useThemeStore.setState({ isDark: true })
    renderHeader()
    expect(logoImage().getAttribute('src')).toBe('mock-logo-dark.png')
  })

  it('swaps the logo as soon as the theme store changes, without remounting', () => {
    renderHeader()
    const before = logoImage()
    expect(before.getAttribute('src')).toBe('mock-logo-light.png')
    act(() => { useThemeStore.getState().toggle() })
    expect(useThemeStore.getState().isDark).toBe(true)
    expect(logoImage().getAttribute('src')).toBe('mock-logo-dark.png')
    // Same DOM node: the header is updated in place, not re-rendered from scratch.
    expect(logoImage()).toBe(before)
    act(() => { useThemeStore.getState().toggle() })
    expect(logoImage().getAttribute('src')).toBe('mock-logo-light.png')
  })

  it('keeps the logo linked to the home page', () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <Header />
        <LocationProbe />
      </MemoryRouter>
    )
    expect(screen.getByTestId('location').textContent).toBe('/catalog')
    fireEvent.click(logoImage())
    expect(screen.getByTestId('location').textContent).toBe('/')
  })
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}
