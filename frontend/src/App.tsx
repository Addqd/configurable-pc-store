import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from './stores/themeStore'
import { useAccountStore } from './stores/accountStore'
import { useUIStore } from './stores/uiStore'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { BuilderPage } from './pages/BuilderPage'
import { CartPage } from './pages/CartPage'
import { ProductPage } from './pages/ProductPage'
import { AccountPage } from './pages/AccountPage'
import { OrdersPage } from './pages/OrdersPage'
import { NotFound } from './pages/NotFound'
import { Header } from './components/Header'
import { AuthModal } from './components/AuthModal'
import placeholder from './assets/placeholder.jpg'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isDark = useThemeStore((s) => s.isDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return <>{children}</>
}

// Apply initial theme immediately before first render
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('pc-builder-theme')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (parsed?.state?.isDark) {
        document.documentElement.classList.add('dark')
      }
    } catch {
      // ignore
    }
  }
}

export default function App() {
  const isAuth = useAccountStore((s) => s.isAuthenticated)
  const activeAccount = useAccountStore((s) => s.activeAccount)
  const logout = useAccountStore((s) => s.logout)

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login')

  // Build user object for Header when authenticated
  const user = activeAccount
    ? {
        name: activeAccount.displayName,
        email: activeAccount.email,
        avatar: activeAccount.avatar || placeholder,
      }
    : null

  const openAuthModal = (mode: 'login' | 'register' = 'login') => {
    setAuthModalMode(mode)
    setAuthModalOpen(true)
  }

  const handleProfileClick = () => {
    useUIStore.getState().toggleProfile()
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Header
            user={user}
            onProfileClick={handleProfileClick}
            onAuthModalOpen={() => openAuthModal('login')}
            onLogout={handleLogout}
          />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/builder" element={<BuilderPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/products/:slug" element={<ProductPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/account/orders" element={<OrdersPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <AuthModal
            isOpen={authModalOpen}
            onClose={() => setAuthModalOpen(false)}
            defaultMode={authModalMode}
          />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
