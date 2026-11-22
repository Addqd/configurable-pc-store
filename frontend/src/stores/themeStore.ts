import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  isDark: boolean
  toggle: () => void
}

export const THEME_STORAGE_KEY = 'pc-builder-theme'

/**
 * Reads the theme persisted by the store without assuming the value is valid.
 *
 * `index.html` applies the same rule inline before the first paint (it cannot
 * import this module), so both must stay in sync.
 */
export function readStoredThemeIsDark(): boolean {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return false
    const state = (parsed as { state?: unknown }).state
    return !!state && typeof state === 'object' && (state as { isDark?: unknown }).isDark === true
  } catch {
    // Missing, blocked or malformed storage keeps the light default.
    return false
  }
}

/** Applies the saved theme class before React renders its first frame. */
export function applyStoredTheme(): void {
  if (typeof document === 'undefined') return
  if (readStoredThemeIsDark()) document.documentElement.classList.add('dark')
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,
      toggle: () => set((s) => ({ isDark: !s.isDark })),
    }),
    {
      name: THEME_STORAGE_KEY,
    }
  )
)
