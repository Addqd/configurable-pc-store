import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Header } from './Header'
import { useUIStore } from '../stores/uiStore'
import { useCartStore } from '../stores/cartStore'

// Mock react-icons
vi.mock('react-icons/fi', () => ({
  FiMenu: () => <div data-testid="fi-menu" />,
  FiSearch: () => <div data-testid="fi-search" />,
  FiShoppingCart: () => <div data-testid="fi-cart" />,
  FiChevronDown: () => <div data-testid="fi-chevron-down" />,
  FiX: () => <div data-testid="fi-x" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

describe('Header component', () => {
  beforeEach(() => {
    useUIStore.getState().closeNav()
    useUIStore.getState().closeSearch()
    useUIStore.getState().closeProfile()
    useCartStore.getState().clear()
    cleanup()
  })

  it('renders hamburger button', () => {
    render(<Header />)
    expect(screen.getByLabelText('Открыть меню')).toBeTruthy()
    expect(screen.getByLabelText('Открыть меню').querySelector('[data-testid="fi-menu"]')).toBeTruthy()
  })

  it('renders logo with correct alt text', () => {
    render(<Header />)
    const logo = screen.getByAltText('PC Builder')
    expect(logo).toBeTruthy()
  })

  it('renders search input with correct placeholder', () => {
    render(<Header />)
    const input = screen.getByPlaceholderText(/поиск комплектующих/i)
    expect(input).toBeTruthy()
  })

  it('renders cart link', () => {
    render(<Header />)
    expect(screen.getByLabelText('Корзина')).toBeTruthy()
  })

  it('renders profile button', () => {
    render(<Header />)
    expect(screen.getByLabelText('Профиль')).toBeTruthy()
  })

  it('toggles navigation menu on hamburger click', () => {
    render(<Header />)
    const btn = screen.getByLabelText('Открыть меню')
    fireEvent.click(btn)
    expect(useUIStore.getState().navOpen).toBe(true)
    fireEvent.click(btn)
    expect(useUIStore.getState().navOpen).toBe(false)
  })

  it('toggles profile dropdown on profile click', () => {
    render(<Header />)
    const btn = screen.getByLabelText('Профиль')
    fireEvent.click(btn)
    expect(useUIStore.getState().profileOpen).toBe(true)
  })

  it('shows cart badge when items exist', () => {
    useCartStore.getState().addItem({
      id: 1, name: 'Test', price: 1000, image: 'test.jpg'
    })
    render(<Header />)
    const badge = screen.getByText('1')
    expect(badge).toBeTruthy()
  })

  it('hides cart badge when cart is empty', () => {
    render(<Header />)
    expect(screen.queryByText('1')).toBeNull()
  })
})
