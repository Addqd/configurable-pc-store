import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Header } from '../Header'

interface AdminLayoutProps {
  children: ReactNode
  /** The event journal renders its own footer inside the panel. */
  footer?: boolean
}

/**
 * Shared administration chrome. The storefront Header stays the single global
 * header; admin pages only add a page container and a small admin footer.
 */
export function AdminLayout({ children, footer = true }: AdminLayoutProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <Header />
      <main className="w-full flex-1 pt-16">
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-8 pt-6 sm:px-6">
          {children}
        </div>
      </main>
      {footer && (
        <footer className="border-t border-border/60 py-5 text-center text-sm text-text-muted">
          {t('admin.common.footer')}
        </footer>
      )}
    </div>
  )
}
