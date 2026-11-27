import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { errorStatusKey, type ErrorStatus } from '../../api/errorStatus'
import { useFullscreenErrorRegistration } from './fullscreenErrorContext'
import shatteredPc from '../../assets/status codes/shattered pc.png'
// Local Fontsource files only: the error page owns its typography and never
// changes the storefront's font stack.
import '@fontsource-variable/tektur/wght.css'
import '@fontsource-variable/inter/wght.css'
import './ErrorPage.css'

interface ErrorPageProps {
  status: ErrorStatus
}

/**
 * The single fullscreen error page for 403, 404, 429, 500 and 503.
 *
 * It replaces the whole page — no Header, Footer, admin navigation or breadcrumbs —
 * and renders at the URL that failed, so the address bar keeps the original URL.
 *
 * "Back" is ordinary browser history, the same way `BackButton` navigates: it may return
 * to another page of this application, to a previous site, or do nothing when the error
 * page is the first entry of the session.
 */
export function ErrorPage({ status }: ErrorPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  useFullscreenErrorRegistration()

  return (
    <main className="pc-error-page">
      <div className="pc-error-page__intro">
        <h1 className="pc-error-page__heading">{t('error_page.heading')}</h1>
        <div className="pc-error-page__text">
          <h2 className="pc-error-page__title">{t(errorStatusKey(status, 'title'))}</h2>
          <p className="pc-error-page__description">{t(errorStatusKey(status, 'description'))}</p>
        </div>
      </div>
      <div className="pc-error-page__stage">
        <img
          className="pc-error-page__art"
          src={shatteredPc}
          alt=""
          width={1402}
          height={1122}
          decoding="async"
          fetchPriority="high"
        />
        <span className="pc-error-page__code">{status}</span>
      </div>
      <div className="pc-error-page__actions">
        <Link to="/" className="pc-error-page__button pc-error-page__button--primary">
          {t('error_page.home')}
        </Link>
        <button
          type="button"
          className="pc-error-page__button pc-error-page__button--secondary"
          onClick={() => navigate(-1)}
        >
          {t('error_page.back')}
        </button>
      </div>
    </main>
  )
}
