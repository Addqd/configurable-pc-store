import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyStoredTheme, readStoredThemeIsDark, useThemeStore } from './themeStore'
import indexHtml from '../../index.html?raw'

describe('Theme store', () => {
  beforeEach(() => {
    useThemeStore.setState({ isDark: false })
  })

  it('starts in light mode', () => {
    expect(useThemeStore.getState().isDark).toBe(false)
  })

  it('toggles to dark mode', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().isDark).toBe(true)
  })

  it('toggles back to light mode', () => {
    useThemeStore.getState().toggle()
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().isDark).toBe(false)
  })
})

describe('first-paint theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    vi.restoreAllMocks()
  })

  it('reads the persisted store payload of a dark theme', () => {
    localStorage.setItem('pc-builder-theme', JSON.stringify({ state: { isDark: true }, version: 0 }))
    expect(readStoredThemeIsDark()).toBe(true)
  })

  it.each([
    ['a light preference', JSON.stringify({ state: { isDark: false }, version: 0 })],
    ['an empty payload', 'null'],
    ['a payload without state', JSON.stringify({ version: 0 })],
    ['a non-boolean value', JSON.stringify({ state: { isDark: 'yes' } })],
    ['malformed json', '{"state":'],
  ])('keeps the light default for %s', (_name, payload) => {
    localStorage.setItem('pc-builder-theme', payload)
    expect(readStoredThemeIsDark()).toBe(false)
  })

  it('keeps working when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readStoredThemeIsDark()).toBe(false)
    expect(() => applyStoredTheme()).not.toThrow()
  })

  it('applies the saved dark class before React renders', () => {
    localStorage.setItem('pc-builder-theme', JSON.stringify({ state: { isDark: true }, version: 0 }))
    applyStoredTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ships the same rule and dark splash colours in the first-paint document', () => {
    // The splash cannot import a module, so `index.html` repeats the rule inline.
    expect(indexHtml).toContain("localStorage.getItem('pc-builder-theme')")
    expect(indexHtml).toContain('saved.state.isDark === true')
    expect(indexHtml).toMatch(/html\.dark\s*\{[^}]*--color-surface-2:\s*#08090c/)
    expect(indexHtml).toMatch(/html\.dark\s*\{[^}]*--color-surface-3:\s*#14171d/)
    // Theme colours must be declared before the splash styles that use them.
    expect(indexHtml.indexOf('html.dark')).toBeLessThan(indexHtml.indexOf('#boot-splash {'))
    // The reduced-motion behaviour of the splash is preserved.
    expect(indexHtml).toContain('prefers-reduced-motion: reduce')
  })
})
