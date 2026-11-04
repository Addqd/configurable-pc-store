import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from './stores/themeStore'
import { useAccountStore } from './stores/accountStore'
import { useCartStore } from './stores/cartStore'
import { useUIStore } from './stores/uiStore'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { BuilderPage } from './pages/BuilderPage'
import { CartPage } from './pages/CartPage'
import { ProductPage } from './pages/ProductPage'
import { AccountPage } from './pages/AccountPage'
import { OrdersPage } from './pages/OrdersPage'
import { SavesPage } from './pages/SavesPage'
import { NotFound } from './pages/NotFound'
import { AuthModal } from './components/AuthModal'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: 1 } } })

function AppStateEffects() {
  const isDark = useThemeStore((s) => s.isDark)
  const accountId = useAccountStore((s) => s.activeAccountId)
  const setOrderAccount = useCartStore((s) => s.setActiveAccountId)
  useEffect(() => { document.documentElement.classList.toggle('dark', isDark) }, [isDark])
  // Restore cart/order ownership after a page refresh and prevent stale cart sessions.
  useEffect(() => { setOrderAccount(accountId) }, [accountId, setOrderAccount])
  return null
}

function AuthModalHost() {
  const isOpen = useUIStore((s) => s.authModalOpen)
  const mode = useUIStore((s) => s.authModalMode)
  const close = useUIStore((s) => s.closeAuthModal)
  // Unmount the form on close: never retain typed passwords between modal sessions.
  if (!isOpen) return null
  return <AuthModal isOpen={true} onClose={close} defaultMode={mode} />
}

// Preserve the existing first-paint theme behavior.
if (typeof window !== 'undefined') {
  try {
    const saved = JSON.parse(localStorage.getItem('pc-builder-theme') || 'null')
    if (saved?.state?.isDark) document.documentElement.classList.add('dark')
  } catch { /* Invalid old theme data is ignored. */ }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppStateEffects />
        {/* The existing pages own their Header. Do not add a second global Header. */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/builder" element={<BuilderPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/products/:slug" element={<ProductPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/orders" element={<OrdersPage />} />
          <Route path="/builds" element={<SavesPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <AuthModalHost />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
