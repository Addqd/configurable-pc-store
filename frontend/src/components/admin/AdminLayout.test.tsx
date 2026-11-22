import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AdminLayout } from './AdminLayout'

vi.mock('../Header', () => ({ Header: () => <header data-testid="storefront-header" /> }))
afterEach(() => cleanup())

function renderAdmin(path = '/admin/products') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Витрина магазина</p>} />
        <Route path="/admin/products" element={<AdminLayout><p>Список товаров</p></AdminLayout>} />
        <Route path="/admin/events" element={<AdminLayout footer={false}><p>Журнал событий</p></AdminLayout>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('admin back control', () => {
  it('provides the single shared BackButton while the header, content and footer stay in place', () => {
    renderAdmin()
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.getByTestId('storefront-header')).toBeTruthy()
    expect(screen.getByText('Список товаров')).toBeTruthy()
    expect(screen.getByText('© PC Builder Панель администратора')).toBeTruthy()
  })

  it('does not render the fixed storefront link', () => {
    renderAdmin()
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
    expect(document.querySelector('a[href="/"]')).toBeNull()
  })

  it('is reachable with the keyboard', () => {
    renderAdmin()
    const button = screen.getByRole('button', { name: 'Назад' })
    button.focus()
    expect(document.activeElement).toBe(button)
  })

  it('returns to the previous history entry instead of navigating to a fixed path', () => {
    render(
      <MemoryRouter initialEntries={['/', '/admin/products']} initialIndex={1}>
        <Routes>
          <Route path="/" element={<p>Витрина магазина</p>} />
          <Route path="/admin/products" element={<AdminLayout><p>Список товаров</p></AdminLayout>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByText('Витрина магазина')).toBeTruthy()
    expect(screen.queryByText('Список товаров')).toBeNull()
  })

  it('stays available on a layout that renders its own footer', () => {
    renderAdmin('/admin/events')
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByText('© PC Builder Панель администратора')).toBeNull()
  })
})
