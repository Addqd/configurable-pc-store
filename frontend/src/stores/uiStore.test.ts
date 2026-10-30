import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './uiStore'

describe('UI store', () => {
  beforeEach(() => {
    useUIStore.setState({
      navOpen: false,
      searchOpen: false,
      profileOpen: false,
      searchQuery: '',
    })
  })

  it('starts with all panels closed', () => {
    expect(useUIStore.getState().navOpen).toBe(false)
    expect(useUIStore.getState().searchOpen).toBe(false)
    expect(useUIStore.getState().profileOpen).toBe(false)
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  it('toggles nav menu', () => {
    useUIStore.getState().toggleNav()
    expect(useUIStore.getState().navOpen).toBe(true)
    useUIStore.getState().toggleNav()
    expect(useUIStore.getState().navOpen).toBe(false)
  })

  it('toggles search', () => {
    useUIStore.getState().toggleSearch()
    expect(useUIStore.getState().searchOpen).toBe(true)
    useUIStore.getState().toggleSearch()
    expect(useUIStore.getState().searchOpen).toBe(false)
  })

  it('toggles profile', () => {
    useUIStore.getState().toggleProfile()
    expect(useUIStore.getState().profileOpen).toBe(true)
    useUIStore.getState().toggleProfile()
    expect(useUIStore.getState().profileOpen).toBe(false)
  })

  it('sets search query', () => {
    useUIStore.getState().setSearchQuery('rtx 4070')
    expect(useUIStore.getState().searchQuery).toBe('rtx 4070')
  })

  it('closes search and clears query', () => {
    useUIStore.getState().toggleSearch()
    useUIStore.getState().setSearchQuery('test')
    expect(useUIStore.getState().searchOpen).toBe(true)
    expect(useUIStore.getState().searchQuery).toBe('test')
    useUIStore.getState().closeSearch()
    expect(useUIStore.getState().searchOpen).toBe(false)
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  it('allows independent panel states', () => {
    useUIStore.getState().toggleNav()
    useUIStore.getState().toggleSearch()
    useUIStore.getState().toggleProfile()
    expect(useUIStore.getState().navOpen).toBe(true)
    expect(useUIStore.getState().searchOpen).toBe(true)
    expect(useUIStore.getState().profileOpen).toBe(true)
  })
})
