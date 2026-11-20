import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FiBarChart2, FiPackage } from 'react-icons/fi'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AdminTabs, type AdminTab } from '../../components/admin/AdminTabs'
import { AnalyticsOverview } from '../../components/admin/AnalyticsOverview'
import { AnalyticsProducts } from '../../components/admin/AnalyticsProducts'
import { BackButton } from '../../components/BackButton'
import { adminCard } from '../../components/admin/adminStyles'
import { readEnum } from '../../admin/params'

const VIEWS = ['overview', 'products'] as const

export function AdminAnalyticsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = readEnum(searchParams, 'view', VIEWS, 'overview')

  const tabs: readonly [AdminTab, AdminTab] = [
    { key: 'overview', label: t('admin.analytics.tab_overview'), icon: FiBarChart2, to: '' },
    { key: 'products', label: t('admin.analytics.tab_products'), icon: FiPackage, to: '' },
  ]

  return (
    <AdminLayout>
      <div className="mb-3"><BackButton /></div>
      <section className={`${adminCard} px-5 py-6 sm:px-8 sm:py-8`}>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {t('admin.analytics.title')}
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary sm:text-base">{t('admin.analytics.subtitle')}</p>

        <div className="mt-6 border-b border-border">
          <AdminTabs
            tabs={tabs}
            activeKey={view}
            label={t('admin.analytics.title')}
            onSelect={(tab) => setSearchParams((current) => {
              const params = new URLSearchParams(current)
              if (tab.key === 'products') params.set('view', 'products')
              else params.delete('view')
              return params
            }, { replace: true })}
          />
        </div>

        <div className="mt-6">
          {view === 'overview' ? <AnalyticsOverview /> : <AnalyticsProducts />}
        </div>
      </section>
    </AdminLayout>
  )
}
