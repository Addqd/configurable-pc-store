import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { FiPackage, FiPlus, FiSearch, FiTrendingUp, FiUsers, FiEdit2, FiTrash2 } from 'react-icons/fi'
import {
  useDeactivateProductApiV1AdminProductsProductIdDelete,
  useGetProductOptionsApiV1AdminProductOptionsGet,
  useListProductsApiV1AdminProductsGet,
} from '../../api/generated/client'
import type { AdminProductSummaryOut } from '../../api/generated/model'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AdminTabs, type AdminTab } from '../../components/admin/AdminTabs'
import { AdminPagination } from '../../components/admin/AdminPagination'
import { AdminEmpty, AdminError } from '../../components/admin/AdminFeedback'
import { AdminInlineValueSkeleton, AdminTableSkeleton } from '../../components/skeletons/AdminSkeletons'
import { DeleteConfirmationModal } from '../../components/admin/DeleteConfirmationModal'
import {
  adminCard, adminControl, adminDangerOutlineButton, adminPrimaryButton,
  adminSecondaryButton, adminSelect, adminTableHead, adminTableHeadCell, adminTableCell,
} from '../../components/admin/adminStyles'
import {
  adminErrorText, formatMoney, MAX_SEARCH_LENGTH, PRODUCT_SORTS, readEnum, readPageSize, readPositiveInt,
  readSearchQuery, readText, withParams, type AdminProductSort,
} from '../../admin/params'
import { useSyncedDraft } from '../../utils/useSyncedDraft'
import { invalidateAfterProductChange } from '../../admin/queryInvalidation'

const STATUSES = ['all', 'active', 'inactive'] as const

export function AdminProductsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const urlQuery = readSearchQuery(searchParams)
  const [searchDraft, setSearchDraft] = useSyncedDraft(urlQuery, (value) => {
    setSearchParams((current) => withParams(current, { q: value, page: 1 }), { replace: true })
  })

  const page = readPositiveInt(searchParams, 'page', 1)
  const pageSize = readPageSize(searchParams)
  const category = readText(searchParams, 'category')
  const status = readEnum(searchParams, 'status', STATUSES, 'all')
  const sort = readEnum<AdminProductSort>(searchParams, 'sort', PRODUCT_SORTS, 'created_desc')

  const list = useListProductsApiV1AdminProductsGet({
    page,
    page_size: pageSize,
    q: urlQuery || undefined,
    category: category || undefined,
    status,
    sort,
  })
  const activeCount = useListProductsApiV1AdminProductsGet(
    { page: 1, page_size: 1, status: 'active' },
    { query: { enabled: list.isSuccess, retry: false } },
  )
  const options = useGetProductOptionsApiV1AdminProductOptionsGet()

  const [target, setTarget] = useState<AdminProductSummaryOut | null>(null)
  const deactivate = useDeactivateProductApiV1AdminProductsProductIdDelete({
    mutation: {
      onSuccess: () => {
        setTarget(null)
        void invalidateAfterProductChange(queryClient)
      },
    },
  })

  const total = list.data?.total ?? 0
  const totalPages = list.data?.total_pages ?? 1
  useEffect(() => {
    if (!list.data) return
    if (page > totalPages) {
      setSearchParams((current) => withParams(current, { page: totalPages }), { replace: true })
    }
  }, [list.data, page, totalPages, setSearchParams])

  const setPage = (next: number) => {
    if (next < 1 || next > totalPages || next === page) return
    setSearchParams((current) => withParams(current, { page: next }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const tabs: readonly [AdminTab, AdminTab] = [
    { key: 'products', label: t('admin.tabs.products'), icon: FiPackage, to: '/admin/products' },
    { key: 'users', label: t('admin.tabs.users'), icon: FiUsers, to: '/admin/users' },
  ]

  return (
    <AdminLayout>
      <section className={`${adminCard} px-5 py-6 sm:px-8 sm:py-8`}>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {t('admin.common.panel_title')}
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary sm:text-base">{t('admin.common.panel_subtitle')}</p>

        <div className="mt-6 border-t border-border pt-1">
          <AdminTabs
            tabs={tabs}
            activeKey="products"
            label={t('admin.tabs.label')}
            variant="navigation"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <Link to="/admin/analytics" className={adminSecondaryButton}>
            <FiTrendingUp className="h-4 w-4" aria-hidden="true" />
            {t('admin.products.analytics')}
          </Link>
          <Link to="/admin/products/new" className={adminPrimaryButton}>
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            {t('admin.products.add')}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h2 className="text-xl font-semibold text-text-primary">{t('admin.products.title')}</h2>
          <p className="text-sm text-text-secondary">
            {t('admin.products.total')}: <span className="font-medium text-text-primary">{list.isLoading ? <AdminInlineValueSkeleton /> : list.data?.total ?? '—'}</span>
          </p>
          <p className="text-sm text-text-secondary">
            {t('admin.products.active_total')}: <span className="font-medium text-text-primary">{list.isLoading || activeCount.isLoading ? <AdminInlineValueSkeleton /> : activeCount.data?.total ?? '—'}</span>
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder={t('admin.products.search_placeholder')}
              aria-label={t('admin.products.search_label')}
              className={`${adminControl} pl-10`}
            />
            {searchDraft.length >= MAX_SEARCH_LENGTH && (
              <p className="mt-1 text-xs text-text-muted">
                {t('admin.common.search_limit', { max: MAX_SEARCH_LENGTH })}
              </p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="relative">
              <span className="sr-only">{t('admin.products.category_filter')}</span>
              <select
                value={category}
                onChange={(event) => setSearchParams((current) => withParams(current, { category: event.target.value, page: 1 }))}
                className={adminSelect}
              >
                <option value="">{t('admin.products.all_categories')}</option>
                {(options.data?.categories ?? []).map(({ category: item }) => (
                  <option key={item.id} value={item.slug}>{item.name}</option>
                ))}
              </select>
              <Chevron />
            </label>
            <label className="relative">
              <span className="sr-only">{t('admin.products.status_filter')}</span>
              <select
                value={status}
                onChange={(event) => setSearchParams((current) => withParams(current, { status: event.target.value === 'all' ? '' : event.target.value, page: 1 }))}
                className={adminSelect}
              >
                <option value="all">{t('admin.products.all_statuses')}</option>
                <option value="active">{t('admin.status.active')}</option>
                <option value="inactive">{t('admin.status.inactive')}</option>
              </select>
              <Chevron />
            </label>
            <label className="relative">
              <span className="sr-only">{t('admin.products.sort_filter')}</span>
              <select
                value={sort}
                onChange={(event) => setSearchParams((current) => withParams(current, { sort: event.target.value, page: 1 }))}
                className={adminSelect}
              >
                <option value="created_desc">{t('admin.products.sort_created_desc')}</option>
                <option value="created_asc">{t('admin.products.sort_created_asc')}</option>
                <option value="updated_desc">{t('admin.products.sort_updated_desc')}</option>
                <option value="updated_asc">{t('admin.products.sort_updated_asc')}</option>
                <option value="name_asc">{t('admin.products.sort_name_asc')}</option>
                <option value="name_desc">{t('admin.products.sort_name_desc')}</option>
                <option value="price_asc">{t('admin.products.sort_price_asc')}</option>
                <option value="price_desc">{t('admin.products.sort_price_desc')}</option>
                <option value="stock_asc">{t('admin.products.sort_stock_asc')}</option>
                <option value="stock_desc">{t('admin.products.sort_stock_desc')}</option>
                <option value="id_asc">{t('admin.products.sort_id_asc')}</option>
                <option value="id_desc">{t('admin.products.sort_id_desc')}</option>
              </select>
              <Chevron />
            </label>
          </div>
        </div>

        <div className="mt-5" aria-busy={list.isFetching}>
          {list.isError ? (
            <AdminError message={adminErrorText(list.error)} onRetry={() => void list.refetch()} compact />
          ) : list.isLoading ? (
            <AdminTableSkeleton
              columns={[
                { widthClass: 'w-[42%]', contentClass: 'h-4 w-3/4' },
                { widthClass: 'w-[18%]', contentClass: 'h-4 w-20' },
                { widthClass: 'w-[16%]', contentClass: 'h-4 w-16' },
                { contentClass: 'h-10 w-52' },
              ]}
            />
          ) : total === 0 ? (
            <AdminEmpty
              title={t('admin.products.empty_title')}
              description={urlQuery || category || status !== 'all' ? t('admin.products.empty_filtered') : t('admin.products.empty_desc')}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className={adminTableHead}>
                      <th scope="col" className={`${adminTableHeadCell} w-[42%]`}>{t('admin.products.col_product')}</th>
                      <th scope="col" className={`${adminTableHeadCell} w-[18%]`}>{t('admin.products.col_price')}</th>
                      <th scope="col" className={`${adminTableHeadCell} w-[16%]`}>{t('admin.products.col_status')}</th>
                      <th scope="col" className={adminTableHeadCell}>{t('admin.products.col_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data?.items.map((product) => (
                      <tr key={product.id} className="border-b border-border last:border-0">
                        <td className={adminTableCell}>
                          <p className="text-sm font-medium text-text-primary">{product.name}</p>
                        </td>
                        <td className={`${adminTableCell} whitespace-nowrap text-sm text-text-primary`}>
                          {formatMoney(product.price)}
                        </td>
                        <td className={adminTableCell}>
                          <span className={`text-sm font-medium ${product.is_active ? 'text-success' : 'text-text-muted'}`}>
                            {product.is_active ? t('admin.status.active') : t('admin.status.inactive')}
                          </span>
                        </td>
                        <td className={adminTableCell}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/admin/products/${product.id}/edit`}
                              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-3"
                            >
                              <FiEdit2 className="h-4 w-4" aria-hidden="true" />
                              {t('admin.products.edit')}
                            </Link>
                            <button
                              type="button"
                              onClick={() => setTarget(product)}
                              disabled={!product.is_active || deactivate.isPending}
                              title={!product.is_active ? t('admin.products.already_inactive') : undefined}
                              className={adminDangerOutlineButton}
                            >
                              <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                              {t('admin.products.deactivate')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <AdminPagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => setSearchParams((current) => withParams(current, { page_size: size, page: 1 }))}
                />
              </div>
            </>
          )}
        </div>
      </section>

      <DeleteConfirmationModal
        open={target !== null}
        title={t('admin.products.deactivate_title')}
        description={(
          <span>
            {t('admin.products.deactivate_desc_prefix')} <strong className="font-semibold">{target?.name}</strong>{' '}
            {t('admin.products.deactivate_desc_suffix')}
          </span>
        )}
        warning={t('admin.products.deactivate_warning')}
        note={t('admin.products.deactivate_note')}
        confirmLabel={t('admin.products.deactivate_confirm')}
        pending={deactivate.isPending}
        error={deactivate.isError ? adminErrorText(deactivate.error) : null}
        onCancel={() => { if (!deactivate.isPending) { setTarget(null); deactivate.reset() } }}
        onConfirm={() => { if (target && !deactivate.isPending) deactivate.mutate({ productId: target.id }) }}
      />
    </AdminLayout>
  )
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
