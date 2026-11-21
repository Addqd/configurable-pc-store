import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queryClient'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from './stores/themeStore'
import { useAccountStore } from './stores/accountStore'
import { useBuilderStore } from './stores/builderStore'
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
import { AdminGate } from './admin/access'
import { AdminProductsPage } from './pages/admin/AdminProductsPage'
import { AdminProductFormPage } from './pages/admin/AdminProductFormPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage'
import { AdminEventsPage } from './pages/admin/AdminEventsPage'

function LangUpdater() {
  const { i18n } = useTranslation()
  useEffect(() => {
    const update = () => {
      const lang = i18n.language || 'ru'
      document.documentElement.lang = lang
      document.title = lang === 'en'
        ? 'PC Builder — Components, Prebuilts & Configurator'
        : 'PC Builder — Комплектующие, Сборки и Конфигуратор'
    }
    update()
    i18n.on('languageChanged', update)
    return () => { i18n.off('languageChanged', update) }
  }, [i18n])
  return null
}

function AppStateEffects() {
  const isDark = useThemeStore((s) => s.isDark)
  const accountId = useAccountStore((s) => s.activeAccountId)
  const restore = useAccountStore((s) => s.restore)
  const previousAccount = useRef(accountId)
  // Remove the static pre-mount placeholder declared in `index.html` in the same
  // frame the application first paints, so it never covers rendered content.
  useLayoutEffect(() => { document.getElementById('boot-splash')?.remove() }, [])
  useEffect(() => { void restore() }, [restore])
  useEffect(() => { document.documentElement.classList.toggle('dark', isDark) }, [isDark])
  // A saved draft opened by account A must never remain editable after A logs out
  // or account B signs in. Keep unowned, unsaved guest drafts untouched.
  useEffect(() => {
    if (previousAccount.current && previousAccount.current !== accountId) useBuilderStore.getState().startNewBuild()
    previousAccount.current = accountId
  }, [accountId])
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
        <LangUpdater />
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
          <Route path="/admin" element={<AdminGate />}>
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="products/new" element={<AdminProductFormPage />} />
            <Route path="products/:productId/edit" element={<AdminProductFormPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="events" element={<AdminEventsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <AuthModalHost />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
