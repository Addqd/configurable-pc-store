import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SearchDropdown } from './SearchDropdown'
import { useUIStore } from '../stores/uiStore'

vi.mock('react-icons/hi2', () => ({
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

describe('SearchDropdown component', () => {
  beforeEach(() => {
    useUIStore.getState().setSearchQuery('')
    cleanup()
  })

  it('returns null when searchQuery is empty and no query', () => {
    const { container } = render(
      <MemoryRouter>
        <SearchDropdown />
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders search results when query exists', () => {
    useUIStore.getState().setSearchQuery('rtx')
    render(
      <MemoryRouter>
        <SearchDropdown />
      </MemoryRouter>
    )
    expect(screen.getByText('Товары')).toBeTruthy()
  })

  it('shows "Показать все (N)" link', () => {
    useUIStore.getState().setSearchQuery('rtx')
    render(
      <MemoryRouter>
        <SearchDropdown />
      </MemoryRouter>
    )
    const link = screen.getAllByText(/показать все/i)[0]
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toContain('/catalog?q=')
  })

  it('shows product names in results', () => {
    useUIStore.getState().setSearchQuery('rtx')
    render(
      <MemoryRouter>
        <SearchDropdown />
      </MemoryRouter>
    )
    const results = screen.getAllByText(/powerplay|ultra|promax/i)
    expect(results.length).toBeGreaterThan(0)
  })

  it('shows product prices', () => {
    useUIStore.getState().setSearchQuery('rtx')
    render(
      <MemoryRouter>
        <SearchDropdown />
      </MemoryRouter>
    )
    const prices = screen.getAllByText(/\d+\s?\d+/)
    expect(prices.length).toBeGreaterThan(0)
  })

  it('shows empty state for no matches', () => {
    useUIStore.getState().setSearchQuery('xyznonexistent12345')
    render(
      <MemoryRouter>
        <SearchDropdown />
      </MemoryRouter>
    )
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
  })
})
