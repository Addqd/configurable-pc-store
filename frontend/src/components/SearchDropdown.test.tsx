import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { render } from '../test-utils'
import { mockCatalogFetch } from '../test-api'
import { SearchDropdown } from './SearchDropdown'
import { useUIStore } from '../stores/uiStore'

beforeEach(() => { useUIStore.getState().setSearchQuery(''); mockCatalogFetch() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('server search suggestions', () => {
  it('makes no request for an empty query', () => {
    const view = render(<SearchDropdown />)
    expect(view.container.firstChild).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('shows server suggestions and links to the full search', async () => {
    useUIStore.getState().setSearchQuery('ryzen')
    render(<SearchDropdown />)
    expect(await screen.findByText('AMD Ryzen 5 7600')).toBeTruthy()
    expect(screen.getByRole('link', { name: /показать все/i }).getAttribute('href')).toBe('/catalog?q=ryzen')
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/search/suggestions'))).toBe(true)
  })
  it('distinguishes a failed request from an empty search result', async () => {
    useUIStore.getState().setSearchQuery('ryzen')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    render(<SearchDropdown />)
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toContain('Не удалось загрузить')
  })
})
