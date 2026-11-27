import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './api/queryClient'
import { useTranslation } from 'react-i18next'
import { useThemeStore, applyStoredTheme } from './stores/themeStore'
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
import { RouteScrollManager } from './navigation/RouteScrollManager'
import { InternalHistoryProvider } from './navigation/InternalHistoryProvider'
import { RouteErrorBoundary } from './components/error/ErrorBoundary'
import { FullscreenErrorContext } from './components/error/fullscreenErrorContext'
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

/**
 * A fullscreen error takes over the screen, so an authentication modal that was
 * already open — or that is opened programmatically afterwards — is closed through the
 * normal UI-store action instead of only being hidden. Otherwise the stale
 * `authModalOpen` flag would bring the modal back after the visitor leaves the error
 * page. `authModalOpen` is therefore part of the effect's dependencies.
 */
function FullscreenErrorModalGuard({ active }: { active: boolean }) {
  const isOpen = useUIStore((s) => s.authModalOpen)
  const closeAuthModal = useUIStore((s) => s.closeAuthModal)
  useEffect(() => { if (active && isOpen) closeAuthModal() }, [active, isOpen, closeAuthModal])
  return null
}

// Preserve the existing first-paint theme behavior: the saved theme is applied
// before React renders, the same way `index.html` does it before the splash paints.
if (typeof window !== 'undefined') applyStoredTheme()

export default function App() {
  // A fullscreen error page owns the screen: the always-mounted auth modal must not
  // cover the state it reports. The page registers itself while it is mounted.
  const [fullscreenErrors, setFullscreenErrors] = useState(0)
  const registerFullscreenError = useCallback((active: boolean) => {
    setFullscreenErrors((count) => Math.max(0, count + (active ? 1 : -1)))
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <InternalHistoryProvider errorActive={fullscreenErrors > 0}>
          <RouteScrollManager />
          <AppStateEffects />
          <LangUpdater />
          <FullscreenErrorContext.Provider value={registerFullscreenError}>
            {/* The existing pages own their Header. Do not add a second global Header. */}
            <RouteErrorBoundary>
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
            </RouteErrorBoundary>
          </FullscreenErrorContext.Provider>
          <FullscreenErrorModalGuard active={fullscreenErrors > 0} />
          {fullscreenErrors === 0 && <AuthModalHost />}
        </InternalHistoryProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
