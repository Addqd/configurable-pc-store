import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useState } from 'react'
import { FiPackage, FiUsers } from 'react-icons/fi'
import { render } from '../../test-utils'
import { AdminTabs, type AdminTab } from './AdminTabs'

const routeTabs: readonly [AdminTab, AdminTab] = [
  { key: 'products', label: 'Товары', icon: FiPackage, to: '/admin/products' },
  { key: 'users', label: 'Пользователи', icon: FiUsers, to: '/admin/users' },
]

const pageTabs: readonly [AdminTab, AdminTab] = [
  { key: 'overview', label: 'Общая статистика', icon: FiPackage, to: '' },
  { key: 'products', label: 'По товарам', icon: FiUsers, to: '' },
]

function PageTabs() {
  const [active, setActive] = useState('overview')
  return (
    <AdminTabs
      tabs={pageTabs}
      activeKey={active}
      label="Аналитика"
      idPrefix="demo-tabs"
      onSelect={(tab) => setActive(tab.key)}
    />
  )
}

afterEach(cleanup)

describe('AdminTabs', () => {
  it('renders route navigation as real links, not ARIA tabs', () => {
    render(
      <MemoryRouter>
        <AdminTabs tabs={routeTabs} activeKey="products" label="Разделы" variant="navigation" />
      </MemoryRouter>,
    )
    const products = screen.getByRole('link', { name: 'Товары' })
    const users = screen.getByRole('link', { name: 'Пользователи' })
    expect(products.getAttribute('href')).toBe('/admin/products')
    expect(users.getAttribute('href')).toBe('/admin/users')
    expect(products.getAttribute('aria-current')).toBe('page')
    expect(users.getAttribute('aria-current')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('wires same-page tabs to their panels with unique ids', () => {
    render(<PageTabs />)
    const overview = screen.getByRole('tab', { name: 'Общая статистика' })
    const products = screen.getByRole('tab', { name: 'По товарам' })
    expect(overview.id).toBe('demo-tabs-tab-overview')
    expect(overview.getAttribute('aria-controls')).toBe('demo-tabs-panel-overview')
    expect(products.getAttribute('aria-controls')).toBe('demo-tabs-panel-products')
    expect(overview.getAttribute('aria-selected')).toBe('true')
    expect(overview.getAttribute('tabindex')).toBe('0')
    expect(products.getAttribute('tabindex')).toBe('-1')
  })

  it('moves and activates tabs with arrow keys and Home/End', () => {
    render(<PageTabs />)
    const overview = screen.getByRole('tab', { name: 'Общая статистика' })
    const products = screen.getByRole('tab', { name: 'По товарам' })

    overview.focus()
    fireEvent.keyDown(overview, { key: 'ArrowRight' })
    expect(products.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(products)
    expect(products.getAttribute('tabindex')).toBe('0')
    expect(overview.getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(products, { key: 'ArrowRight' })
    expect(overview.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(overview)

    fireEvent.keyDown(overview, { key: 'End' })
    expect(products.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(products, { key: 'Home' })
    expect(overview.getAttribute('aria-selected')).toBe('true')
  })
})
