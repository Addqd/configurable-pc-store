import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ProfileDropdown } from './ProfileDropdown'
import { useThemeStore } from '../stores/themeStore'

/** The reload helper is the observable success boundary of a completed logout. */
const reloadAfterAuthChange = vi.hoisted(() => vi.fn())

vi.mock('../stores/accountStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../stores/accountStore')>()
  return { ...actual, reloadAfterAuthChange }
})

vi.mock('react-icons/fi', () => ({
  FiUser: () => <div data-testid="fi-user" />,
  FiBox: () => <div data-testid="fi-box" />,
  FiFileText: () => <div data-testid="fi-file" />,
  FiLogOut: () => <div data-testid="fi-logout" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniMoon: () => <div data-testid="hi-moon" />,
  HiMiniSun: () => <div data-testid="hi-sun" />,
}))

describe('ProfileDropdown component', () => {
  const mockUser = {
    name: 'Анна Петрова',
    email: 'anna.petrova@mail.ru',
    avatar: '/placeholder.jpg',
  }

  beforeEach(() => {
    useThemeStore.setState({ isDark: false })
    reloadAfterAuthChange.mockClear()
    cleanup()
  })

  it('renders user name and email', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    expect(screen.getByText('Анна Петрова')).toBeTruthy()
    expect(screen.getByText('anna.petrova@mail.ru')).toBeTruthy()
  })

  it('renders user avatar image', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    const avatar = screen.getByAltText('Анна Петрова')
    expect(avatar).toBeTruthy()
  })

  it('renders the remaining menu items without the removed settings entry', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    expect(screen.getByText('Личный кабинет')).toBeTruthy()
    expect(screen.getByText('Мои сборки')).toBeTruthy()
    expect(screen.getByText('Мои заказы')).toBeTruthy()
    // «Настройки» duplicated the account page with a decorative arrow; the entry
    // was removed and must not come back through another label.
    expect(screen.queryByText('Настройки')).toBeNull()
    expect(screen.queryByTestId('fi-settings')).toBeNull()
  })

  it('keeps every menu target of the approved menu', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    const targets = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(targets).toEqual(['/account', '/builds', '/account/orders'])
  })

  it('renders dark theme toggle', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    expect(screen.getByText('Тёмная тема')).toBeTruthy()
  })

  it('renders logout button', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    expect(screen.getByText(/выйти из аккаунта/i)).toBeTruthy()
  })

  it('toggles theme when toggle button clicked', () => {
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Тёмная тема'))
    expect(useThemeStore.getState().isDark).toBe(true)
  })

  it('reloads the page once after a successful logout', async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined)
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} onLogout={onLogout} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText(/выйти из аккаунта/i))
    await vi.waitFor(() => expect(reloadAfterAuthChange).toHaveBeenCalledTimes(1))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('does not reload when logout fails', async () => {
    const onLogout = vi.fn().mockRejectedValue(new Error('server unavailable'))
    render(
      <MemoryRouter>
        <ProfileDropdown user={mockUser} onLogout={onLogout} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText(/выйти из аккаунта/i))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(reloadAfterAuthChange).not.toHaveBeenCalled()
  })
})
