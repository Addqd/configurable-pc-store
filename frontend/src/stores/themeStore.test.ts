import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore } from './themeStore'

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
