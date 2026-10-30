import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from './stores/themeStore'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { BuilderPage } from './pages/BuilderPage'
import { CartPage } from './pages/CartPage'
import { ProductPage } from './pages/ProductPage'
import { AccountPage } from './pages/AccountPage'
import { NotFound } from './pages/NotFound'

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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/builder" element={<BuilderPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/products/:slug" element={<ProductPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
