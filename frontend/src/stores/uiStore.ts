import { create } from 'zustand'

interface UIState {
  navOpen: boolean
  searchOpen: boolean
  profileOpen: boolean
  searchQuery: string
  toggleNav: () => void
  closeNav: () => void
  toggleSearch: () => void
  openSearch: () => void
  closeSearch: () => void
  toggleProfile: () => void
  closeProfile: () => void
  setSearchQuery: (q: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  navOpen: false,
  searchOpen: false,
  profileOpen: false,
  searchQuery: '',
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  closeNav: () => set({ navOpen: false }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
  toggleProfile: () => set((s) => ({ profileOpen: !s.profileOpen })),
  closeProfile: () => set({ profileOpen: false }),
  setSearchQuery: (q) => set({ searchQuery: q }),
}))
