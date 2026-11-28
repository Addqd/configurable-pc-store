import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { Footer } from './Footer'
import i18n from '../i18n'
import { useThemeStore } from '../stores/themeStore'

// The two approved theme assets are mocked so the component is asserted on the
// module it resolves, not on Vite's hashed asset URL.
vi.mock('../assets/logo/pc builder logo.png', () => ({ default: 'mock-logo-light.png' }))
vi.mock('../assets/logo/pc builder logo dark.png', () => ({ default: 'mock-logo-dark.png' }))

vi.mock('react-icons/fi', () => ({
  FiShoppingCart: () => <div data-testid="fi-cart" />,
  FiPhone: () => <div data-testid="fi-phone" />,
  FiFileText: () => <div data-testid="fi-file" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniCube: () => <div data-testid="hi-cube" />,
  HiMiniChevronRight: ({ className }: { className?: string }) => <div data-testid="hi-chevron" className={className} />,
}))

vi.mock('react-icons/si', () => ({
  SiTelegram: () => <div data-testid="si-telegram" />,
  SiVk: () => <div data-testid="si-vk" />,
  SiYoutube: () => <div data-testid="si-youtube" />,
  SiGmail: () => <div data-testid="si-gmail" />,
  SiGithub: () => <div data-testid="si-github" />,
}))

const GITHUB_URL = 'https://github.com/Addqd/configurable-pc-store'

const PLACEHOLDER_LABELS = [
  'О нас',
  'Доставка и оплата',
  'Гарантия и возврат',
  'Частые вопросы (FAQ)',
  'Электронная почта',
  'Телефон',
  'Telegram',
  'Форма обратной связи',
  'Политика конфиденциальности (раздел в разработке)',
  'Пользовательское соглашение (раздел в разработке)',
  'Публичная оферта (раздел в разработке)',
  'Обработка персональных данных (раздел в разработке)',
]

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

const renderFooter = (entries = ['/somewhere']) =>
  render(
    <MemoryRouter initialEntries={entries}>
      <Footer />
      <LocationProbe />
    </MemoryRouter>
  )

const currentLocation = () => screen.getByTestId('location').textContent
const footerLogo = () => screen.getByAltText('PC Builder') as HTMLImageElement

describe('Footer component', () => {
  beforeEach(() => {
    cleanup()
    useThemeStore.setState({ isDark: false })
  })
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('ru') }) })

  it('renders footer element', () => {
    renderFooter()
    expect(document.querySelector('footer')).toBeTruthy()
  })

  it('renders all 4 column headings', () => {
    renderFooter()
    expect(screen.getByText('Магазин')).toBeTruthy()
    expect(screen.getByText('Покупателям')).toBeTruthy()
    expect(screen.getByText('Контакты')).toBeTruthy()
    expect(screen.getByText('Документы')).toBeTruthy()
  })

  it('keeps exactly the three functional Shop links and their destinations', () => {
    renderFooter()
    const hrefs = [...document.querySelectorAll('footer a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/catalog', '/catalog?category=prebuilt', '/builder', GITHUB_URL])
    expect(screen.getByRole('link', { name: /Каталог товаров/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Готовые сборки/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Конфигуратор ПК/ })).toBeTruthy()
  })

  it('navigates with the functional Shop links', async () => {
    const user = userEvent.setup()
    renderFooter()
    await user.click(screen.getByRole('link', { name: /Конфигуратор ПК/ }))
    expect(currentLocation()).toBe('/builder')
  })

  it('renders every other column entry as an inert placeholder button', () => {
    renderFooter()
    expect(screen.getByText('Каталог товаров').closest('a')).not.toBeNull()
    PLACEHOLDER_LABELS.forEach(label => {
      const entry = screen.getByText(label)
      expect(entry.closest('a')).toBeNull()
      expect(entry.tagName).toBe('BUTTON')
      expect(entry.getAttribute('type')).toBe('button')
      expect(entry.hasAttribute('href')).toBe(false)
    })
  })

  it('performs no action when a placeholder is clicked', async () => {
    const user = userEvent.setup()
    renderFooter()
    for (const label of PLACEHOLDER_LABELS) {
      await user.click(screen.getByText(label))
    }
    expect(currentLocation()).toBe('/somewhere')
    // No obsolete contact notification is shown either.
    expect(screen.queryByText(/Форма обратной связи будет доступна/)).toBeNull()
    expect(document.body.textContent).not.toContain('contact_notif')
  })

  it('preserves the appearance and hover styling of the placeholders', () => {
    renderFooter()
    const placeholder = screen.getByText('Доставка и оплата')
    expect(placeholder.className).toBe(
      'inline-flex items-center gap-2 text-left text-sm text-text-secondary hover:text-primary transition-colors group cursor-pointer',
    )
    expect(placeholder.querySelector('[data-testid="hi-chevron"]')?.className).toContain('group-hover:opacity-100')
  })

  it('keeps the placeholders keyboard accessible', async () => {
    const user = userEvent.setup()
    renderFooter()
    const placeholder = screen.getByText('О нас')
    // The three Shop links come first in tab order, then the first placeholder.
    for (let press = 0; press < 4; press += 1) await user.tab()
    expect(document.activeElement).toBe(placeholder)
    expect(placeholder.tagName).toBe('BUTTON')
  })

  it('renders copyright notice with the 2027 year', () => {
    renderFooter()
    expect(screen.getByText('© 2027 PC Builder. Все права защищены.')).toBeTruthy()
    expect(screen.queryByText(/2026/)).toBeNull()
  })

  it('renders copyright notice in English as well', async () => {
    renderFooter()
    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByText('© 2027 PC Builder. All rights reserved.')).toBeTruthy()
  })

  it('does not render the tagline', () => {
    renderFooter()
    expect(screen.queryByText(/Комплектующие\. Сборки\. Конфигуратор/)).toBeNull()
  })

  it('renders the four social icons as inert placeholders', () => {
    renderFooter()
    for (const label of ['Telegram', 'VK', 'YouTube', 'Email']) {
      const social = screen.getByLabelText(label)
      expect(social.tagName).toBe('BUTTON')
      expect(social.getAttribute('type')).toBe('button')
      expect(document.querySelector(`footer a[aria-label="${label}"]`)).toBeNull()
    }
    expect(document.querySelectorAll('footer a')).toHaveLength(4)
  })

  it('keeps the social styling on the inert icons', () => {
    renderFooter()
    const social = screen.getByLabelText('Telegram')
    expect(social.className).toBe(
      'w-9 h-9 flex items-center justify-center rounded-lg bg-surface-3 hover:bg-primary-light text-text-muted hover:text-primary transition-colors cursor-pointer',
    )
    expect(social.querySelector('[data-testid="si-telegram"]')).not.toBeNull()
  })

  it('renders a functional GitHub link as the only external destination', () => {
    renderFooter()
    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(github.getAttribute('href')).toBe(GITHUB_URL)
    expect(github.getAttribute('target')).toBe('_blank')
    expect(github.getAttribute('rel')).toBe('noopener noreferrer')
    expect(github.querySelector('[data-testid="si-github"]')).not.toBeNull()
    // Same container styling as the inert social icons.
    expect(github.className).toBe(screen.getByLabelText('Email').className)
  })

  it('renders logo', () => {
    renderFooter()
    const logos = screen.getAllByAltText('PC Builder')
    expect(logos.length).toBeGreaterThan(0)
  })

  it('renders the light logo in light theme', () => {
    renderFooter()
    const logo = footerLogo()
    expect(logo.getAttribute('src')).toBe('mock-logo-light.png')
    expect(logo.getAttribute('alt')).toBe('PC Builder')
    expect(logo.className).toBe('h-8 w-auto')
  })

  it('renders the dark logo in dark theme', () => {
    useThemeStore.setState({ isDark: true })
    renderFooter()
    expect(footerLogo().getAttribute('src')).toBe('mock-logo-dark.png')
  })

  it('swaps the logo as soon as the theme store changes, without remounting', () => {
    renderFooter()
    const before = footerLogo()
    expect(before.getAttribute('src')).toBe('mock-logo-light.png')
    act(() => { useThemeStore.getState().toggle() })
    expect(footerLogo().getAttribute('src')).toBe('mock-logo-dark.png')
    // Same DOM node: the footer logo is updated in place, not re-rendered from scratch.
    expect(footerLogo()).toBe(before)
    act(() => { useThemeStore.getState().toggle() })
    expect(footerLogo().getAttribute('src')).toBe('mock-logo-light.png')
  })
})
