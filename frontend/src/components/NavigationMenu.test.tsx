import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { NavigationMenu } from './NavigationMenu'
import i18n from '../i18n'

vi.mock('react-icons/fi', () => ({
  FiHome: () => <div data-testid="fi-home" />,
  FiTool: () => <div data-testid="fi-tool" />,
  FiBox: () => <div data-testid="fi-box" />,
  FiCpu: () => <div data-testid="fi-cpu" />,
  FiMonitor: () => <div data-testid="fi-monitor" />,
  FiHeadphones: () => <div data-testid="fi-headphones" />,
  FiWind: () => <div data-testid="fi-wind" />,
  FiServer: () => <div data-testid="fi-server" />,
  FiSettings: () => <div data-testid="fi-settings" />,
  FiTag: () => <div data-testid="fi-tag" />,
  FiHelpCircle: () => <div data-testid="fi-help" />,
  FiInfo: () => <div data-testid="fi-info" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

const renderMenu = () =>
  render(
    <MemoryRouter>
      <NavigationMenu onClose={() => {}} />
    </MemoryRouter>
  )

const menuLinks = () => screen.getAllByRole('link')
const menuHrefs = () => menuLinks().map((link) => link.getAttribute('href'))

describe('NavigationMenu component', () => {
  afterEach(async () => {
    cleanup()
    await act(async () => { await i18n.changeLanguage('ru') })
  })

  it('renders all 12 menu items', () => {
    renderMenu()
    const items = [
      'Главная',
      'Конфигуратор ПК',
      'Готовые сборки',
      'Комплектующие',
      'Периферия',
      'Аксессуары',
      'Охлаждение',
      'Сетевое оборудование',
      'Софт и сервисы',
      'Акции',
      'Помощь',
      'О нас',
    ]
    items.forEach(label => {
      expect(screen.getByText(label)).toBeTruthy()
    })
    expect(menuLinks()).toHaveLength(items.length)
  })

  it('places the PC configurator directly after the home entry and links to /builder', () => {
    renderMenu()
    const hrefs = menuHrefs()
    expect(hrefs[0]).toBe('/')
    expect(hrefs[1]).toBe('/builder')
    expect(hrefs.indexOf('/builder')).toBe(1)
    expect(menuLinks()[1].textContent).toContain('Конфигуратор ПК')
    // The existing catalogue destinations are untouched, only shifted by one.
    expect(hrefs.slice(2)).toEqual([
      '/catalog?category=prebuilt',
      '/catalog?category=components',
      '/catalog?category=peripheral',
      '/catalog?category=accessories',
      '/catalog?category=cooling',
      '/catalog?category=network',
      '/catalog?category=software',
      '/catalog?category=sale',
      '/account',
      '/account',
    ])
  })

  it('keeps the configurator entry inside the approved item markup', () => {
    renderMenu()
    const configurator = menuLinks()[1]
    expect(configurator.className).toBe(
      'flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-primary-light hover:text-primary rounded-lg transition-colors',
    )
    expect(configurator.querySelector('[data-testid="fi-tool"]')).not.toBeNull()
    // Same trailing chevron as every other entry.
    expect(configurator.querySelector('[data-testid="hi-chevron"]')).not.toBeNull()
  })

  it('keeps the separator between the catalogue group and the sale entry', () => {
    renderMenu()
    const separator = document.querySelector('.mx-4.my-1.border-t') as HTMLElement
    expect(separator).not.toBeNull()
    // The separator belongs to the wrapper of the entry that follows it: «Акции».
    const followingLink = separator.parentElement?.querySelector('a')
    expect(followingLink?.textContent).toContain('Акции')
    expect(followingLink?.getAttribute('href')).toBe('/catalog?category=sale')
    const precedingLink = menuLinks()[menuHrefs().indexOf('/catalog?category=sale') - 1]
    expect(precedingLink.textContent).toContain('Софт и сервисы')
  })

  it('localizes the new entry in Russian and English', async () => {
    renderMenu()
    expect(screen.getByText('Конфигуратор ПК')).toBeTruthy()

    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByText('PC Configurator')).toBeTruthy()
    expect(screen.queryByText('Конфигуратор ПК')).toBeNull()
    // Position and destination survive the language switch.
    expect(menuHrefs()[1]).toBe('/builder')
  })

  it('calls onClose when a menu item is clicked', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <NavigationMenu onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Главная'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes the menu when the configurator entry is used', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <NavigationMenu onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Конфигуратор ПК'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders icons for each menu item', () => {
    renderMenu()
    const iconElements = document.querySelectorAll('[data-testid]')
    expect(iconElements.length).toBeGreaterThan(0)
  })

  it('renders a separator line', () => {
    renderMenu()
    const separators = document.querySelectorAll('.border-t')
    expect(separators.length).toBeGreaterThanOrEqual(1)
  })
})
