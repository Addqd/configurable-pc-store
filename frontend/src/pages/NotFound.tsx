import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex flex-col bg-surface-2">
      <Header />
      <main className="flex-1 pt-20 px-4 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-text-primary mb-4">404</h1>
          <p className="text-text-secondary mb-6">{t('common.not_found_title')}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <BackButton />
            <Link to="/" className="text-primary hover:underline">{t('common.go_home')}</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
