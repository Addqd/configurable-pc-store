import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './uiStore'

describe('UI store', () => {
  beforeEach(() => {
    useUIStore.setState({
      navOpen: false,
      searchOpen: false,
      profileOpen: false,
      searchQuery: '',
      authModalOpen: false,
      authModalMode: 'login',
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

  it('opens search idempotently without toggling it off', () => {
    useUIStore.getState().openSearch()
    useUIStore.getState().openSearch()
    expect(useUIStore.getState().searchOpen).toBe(true)
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

  it('keeps Header panels mutually exclusive', () => {
    useUIStore.getState().toggleNav()
    expect(useUIStore.getState().navOpen).toBe(true)
    expect(useUIStore.getState().searchOpen).toBe(false)
    expect(useUIStore.getState().profileOpen).toBe(false)

    useUIStore.getState().toggleSearch()
    expect(useUIStore.getState().navOpen).toBe(false)
    expect(useUIStore.getState().searchOpen).toBe(true)
    expect(useUIStore.getState().profileOpen).toBe(false)

    useUIStore.getState().toggleProfile()
    expect(useUIStore.getState().navOpen).toBe(false)
    expect(useUIStore.getState().searchOpen).toBe(false)
    expect(useUIStore.getState().profileOpen).toBe(true)
  })

  it('opening the authentication modal closes all Header panels', () => {
    useUIStore.getState().toggleNav()
    useUIStore.getState().openAuthModal('register')
    const state = useUIStore.getState()
    expect(state.navOpen).toBe(false)
    expect(state.searchOpen).toBe(false)
    expect(state.profileOpen).toBe(false)
    expect(state.authModalOpen).toBe(true)
    expect(state.authModalMode).toBe('register')
  })
})
