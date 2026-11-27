import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FiLock, FiShieldOff } from 'react-icons/fi'
import { useGetUserApiV1AdminUsersUserIdGet } from '../api/generated/client'
import { ApiError } from '../api/transport'
import { selectActiveAccount, useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { AdminSessionContext, type AdminSession } from './adminSession'
import { AdminLayout } from '../components/admin/AdminLayout'
import { AdminError } from '../components/admin/AdminFeedback'
import { AdminPageSkeleton } from '../components/skeletons/AdminSkeletons'
import { adminCard, adminPrimaryButton, adminSecondaryButton } from '../components/admin/adminStyles'
import { ErrorPage } from '../components/error/ErrorPage'
import { errorPageStatus } from '../api/errorStatus'

function AccessPanel({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <AdminLayout>
      <section className={`${adminCard} mx-auto flex max-w-[560px] flex-col items-center px-6 py-14 text-center`}>
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
          {icon}
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 max-w-[420px] text-sm text-text-secondary">{description}</p>
        <div className="mt-6">{action}</div>
      </section>
    </AdminLayout>
  )
}

/**
 * Authorization gate for `/admin/*`.
 *
 * The access token is restored first, then the protected admin endpoint is the
 * authority on the role; the frontend never infers administrator rights from
 * client storage. Logout/account change clears admin queries via
 * `privateEndpoints.ts`, so stale admin data cannot survive a session change.
 */
export function AdminGate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const account = useAccountStore(selectActiveAccount)
  const openAuthModal = useUIStore((state) => state.openAuthModal)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    let active = true
    void useAccountStore.getState().restore().finally(() => {
      if (active) setRestored(true)
    })
    return () => { active = false }
  }, [])

  const userId = account ? Number(account.id) : 0
  const validId = Number.isSafeInteger(userId) && userId > 0
  const access = useGetUserApiV1AdminUsersUserIdGet(userId, {
    query: { enabled: restored && validId, retry: false, staleTime: 60_000 },
  })

  if (!restored || (account && access.isPending)) {
    return <AdminLayout><AdminPageSkeleton /></AdminLayout>
  }

  if (!account) {
    return (
      <AccessPanel
        icon={<FiLock className="h-6 w-6" />}
        title={t('admin.access.guest_title')}
        description={t('admin.access.guest_desc')}
        action={(
          <button type="button" onClick={() => openAuthModal('login')} className={adminPrimaryButton}>
            {t('admin.access.login')}
          </button>
        )}
      />
    )
  }

  if (access.isError) {
    const status = access.error instanceof ApiError ? access.error.status : 0
    // An authenticated visitor the server refuses to treat as an administrator is
    // denied the whole panel: the page is replaced, not decorated inside AdminLayout.
    if (status === 403) return <ErrorPage status={403} />
    if (status === 401 || status === 404) {
      return (
        <AccessPanel
          icon={<FiShieldOff className="h-6 w-6" />}
          title={t('admin.access.forbidden_title')}
          description={t('admin.access.forbidden_desc')}
          action={(
            <button type="button" onClick={() => navigate('/')} className={adminSecondaryButton}>
              {t('admin.access.to_store')}
            </button>
          )}
        />
      )
    }
    // A transient failure after a successful check must not unmount the admin
    // page: the verified session stays mounted and unsaved forms survive.
    if (!access.data) {
      // Without verified access data there is no panel to keep. An unavailable
      // authorization check (429/500/503) is a fullscreen page, never a retry panel
      // that could look like an authorization result.
      const pageStatus = errorPageStatus(access.error)
      if (pageStatus) return <ErrorPage status={pageStatus} />
      return (
        <AdminLayout>
          <section className={`${adminCard} p-6`}>
            <AdminError message={t('admin.access.error_desc')} onRetry={() => void access.refetch()} />
          </section>
        </AdminLayout>
      )
    }
  }

  if (!access.data) {
    if (access.isPending) return <AdminLayout><AdminPageSkeleton /></AdminLayout>
    // A session without a resolvable account id cannot be an administrator.
    return <Navigate to="/" replace />
  }

  const session: AdminSession = {
    userId: access.data.id,
    role: access.data.role,
    displayName: access.data.display_name,
    email: access.data.email,
  }

  return (
    <AdminSessionContext.Provider value={session}>
      <Outlet />
    </AdminSessionContext.Provider>
  )
}
