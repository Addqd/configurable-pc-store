import { create } from 'zustand'

type AuthMode = 'login' | 'register'

interface UIState {
  navOpen: boolean
  searchOpen: boolean
  profileOpen: boolean
  searchQuery: string
  authModalOpen: boolean
  authModalMode: AuthMode
  toggleNav: () => void
  closeNav: () => void
  toggleSearch: () => void
  openSearch: () => void
  closeSearch: () => void
  toggleProfile: () => void
  closeProfile: () => void
  setSearchQuery: (q: string) => void
  openAuthModal: (mode?: AuthMode) => void
  closeAuthModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  navOpen: false,
  searchOpen: false,
  profileOpen: false,
  searchQuery: '',
  authModalOpen: false,
  authModalMode: 'login',
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen, searchOpen: false, profileOpen: false })),
  closeNav: () => set({ navOpen: false }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen, navOpen: false, profileOpen: false })),
  openSearch: () => set({ searchOpen: true, navOpen: false, profileOpen: false }),
  closeSearch: () => set({ searchOpen: false, searchQuery: '' }),
  toggleProfile: () => set((s) => ({ profileOpen: !s.profileOpen, navOpen: false, searchOpen: false })),
  closeProfile: () => set({ profileOpen: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  openAuthModal: (authModalMode = 'login') => set({
    authModalMode, authModalOpen: true, navOpen: false, searchOpen: false, profileOpen: false,
  }),
  closeAuthModal: () => set({ authModalOpen: false }),
}))
