import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  FiChevronDown, FiChevronUp, FiClock, FiEdit2, FiSearch, FiTrash2, FiUser, FiUserPlus, FiUsers, FiPackage,
} from 'react-icons/fi'
import {
  useDeleteUserApiV1AdminUsersUserIdDelete,
  useListUsersApiV1AdminUsersGet,
  useUpdateUserApiV1AdminUsersUserIdPatch,
} from '../../api/generated/client'
import type { AdminUserOut } from '../../api/generated/model'
import { useAdminSession } from '../../admin/adminSession'
import { adminErrorText, MAX_SEARCH_LENGTH, USER_SORTS, readEnum, readPageSize, readPositiveInt, readSearchQuery, withParams, type AdminUserSort } from '../../admin/params'
import { ADMIN_EVENTS_PATH, ADMIN_USERS_PATH, invalidatePath } from '../../admin/queryInvalidation'
import { useSyncedDraft } from '../../utils/useSyncedDraft'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AdminTabs, type AdminTab } from '../../components/admin/AdminTabs'
import { AdminPagination } from '../../components/admin/AdminPagination'
import { AdminEmpty, AdminError, AdminLoading } from '../../components/admin/AdminFeedback'
import { AdminDialog, AdminDialogClose } from '../../components/admin/AdminDialog'
import { useDialogTitleId } from '../../components/admin/useDialogTitleId'
import { DeleteConfirmationModal } from '../../components/admin/DeleteConfirmationModal'
import { SelectField, TextareaField } from '../../components/admin/AdminFields'
import {
  adminCard, adminControl, adminDangerOutlineButton, adminPrimaryButton, adminSecondaryButton,
  adminSelect, adminTableHead, adminTableHeadCell, adminTableCell,
} from '../../components/admin/adminStyles'

const ROLES = ['all', 'user', 'admin', 'owner'] as const
const STATUSES = ['all', 'active', 'blocked'] as const
const EDIT_ROLE_OPTIONS = ['user', 'admin'] as const

export function AdminUsersPage() {
  const { t } = useTranslation()
  const session = useAdminSession()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlQuery = readSearchQuery(searchParams)
  const [searchDraft, setSearchDraft] = useSyncedDraft(urlQuery, (value) => {
    setSearchParams((current) => withParams(current, { q: value, page: 1 }), { replace: true })
  })
  const page = readPositiveInt(searchParams, 'page', 1)
  const pageSize = readPageSize(searchParams)
  const role = readEnum(searchParams, 'role', ROLES, 'all')
  const status = readEnum(searchParams, 'status', STATUSES, 'all')
  const sort = readEnum<AdminUserSort>(searchParams, 'sort', USER_SORTS, 'created_desc')

  const users = useListUsersApiV1AdminUsersGet({
    page,
    page_size: pageSize,
    q: urlQuery || undefined,
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    sort,
  })
  const activeUsers = useListUsersApiV1AdminUsersGet(
    { page: 1, page_size: 1, status: 'active' },
    { query: { enabled: users.isSuccess, retry: false } },
  )
  const blockedUsers = useListUsersApiV1AdminUsersGet(
    { page: 1, page_size: 1, status: 'blocked' },
    { query: { enabled: users.isSuccess, retry: false } },
  )

  const [editing, setEditing] = useState<AdminUserOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserOut | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [roleValue, setRoleValue] = useState<'user' | 'admin'>('user')
  const [statusValue, setStatusValue] = useState<'active' | 'blocked'>('active')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  const openEdit = (user: AdminUserOut) => {
    updateUser.reset()
    setEditing(user)
    setRoleValue(user.role === 'admin' ? 'admin' : 'user')
    setStatusValue(user.status === 'blocked' ? 'blocked' : 'active')
    setReason(user.blocked_reason ?? '')
    setReasonError(null)
    setFormError(null)
  }

  const closeEdit = () => {
    if (updateUser.isPending) return
    setEditing(null)
    setFormError(null)
    setReasonError(null)
    updateUser.reset()
  }

  const updateUser = useUpdateUserApiV1AdminUsersUserIdPatch({
    mutation: {
      onSuccess: () => {
        void invalidatePath(queryClient, ADMIN_USERS_PATH)
        void invalidatePath(queryClient, ADMIN_EVENTS_PATH)
        setEditing(null)
        setNotice(t('admin.users.saved'))
      },
    },
  })
  const deleteUser = useDeleteUserApiV1AdminUsersUserIdDelete({
    mutation: {
      onSuccess: () => {
        void invalidatePath(queryClient, ADMIN_USERS_PATH)
        void invalidatePath(queryClient, ADMIN_EVENTS_PATH)
        setDeleteTarget(null)
        setNotice(t('admin.users.deleted'))
      },
    },
  })

  const total = users.data?.total ?? 0
  const totalPages = users.data?.total_pages ?? 1
  useEffect(() => {
    if (users.data && page > totalPages) {
      setSearchParams((current) => withParams(current, { page: totalPages }), { replace: true })
    }
  }, [users.data, page, totalPages, setSearchParams])

  const tabs: readonly [AdminTab, AdminTab] = [
    { key: 'products', label: t('admin.tabs.products'), icon: FiPackage, to: '/admin/products' },
    { key: 'users', label: t('admin.tabs.users'), icon: FiUsers, to: '/admin/users' },
  ]

  const nameSortActive = sort === 'display_name_asc' || sort === 'display_name_desc'
  const toggleNameSort = () => {
    const next: AdminUserSort = sort === 'display_name_asc' ? 'display_name_desc' : 'display_name_asc'
    setSearchParams((current) => withParams(current, { sort: next, page: 1 }))
  }

  const saveUser = () => {
    if (!editing || updateUser.isPending) return
    setFormError(null)
    setReasonError(null)
    const blocked = statusValue === 'blocked'
    const trimmedReason = reason.trim()
    if (blocked && !trimmedReason) {
      setReasonError(t('admin.users.block_reason_required'))
      return
    }
    const data: { role?: 'user' | 'admin'; status?: 'active' | 'blocked'; blocked_reason?: string } = {}
    const canChangeRole = session.role === 'owner' && editing.role !== 'owner'
    if (canChangeRole && roleValue !== editing.role) data.role = roleValue
    if (statusValue !== editing.status) {
      data.status = statusValue
      if (blocked) data.blocked_reason = trimmedReason
    } else if (blocked && trimmedReason !== (editing.blocked_reason ?? '')) {
      data.blocked_reason = trimmedReason
    }
    if (Object.keys(data).length === 0) {
      setFormError(t('admin.common.no_changes'))
      return
    }
    updateUser.mutate({ userId: editing.id, data })
  }

  const editDisabledReason = (user: AdminUserOut): string | null => {
    if (user.id === session.userId) return t('admin.users.self_locked')
    if (user.role === 'owner') return t('admin.users.owner_locked')
    if (session.role !== 'owner' && user.role !== 'user') return t('admin.users.admin_boundary')
    return null
  }

  const titleId = useDialogTitleId('user-edit-dialog')

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
            activeKey="users"
            label={t('admin.tabs.label')}
            variant="navigation"
          />
        </div>

        {notice && (
          <p role="status" className="mt-4 rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-text-primary">
            <span className="mr-2 text-success" aria-hidden="true">✓</span>{notice}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-xl font-semibold text-text-primary">{t('admin.users.title')}</h2>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            {t('admin.users.total')}: <span className="font-medium text-text-primary">{users.data?.total ?? '—'}</span>
          </p>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            {t('admin.users.active_total')}: <span className="font-medium text-text-primary">{activeUsers.data?.total ?? '—'}</span>
          </p>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            {t('admin.users.blocked_total')}: <span className="font-medium text-text-primary">{blockedUsers.data?.total ?? '—'}</span>
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder={t('admin.users.search_placeholder')}
              aria-label={t('admin.users.search_label')}
              className={`${adminControl} pl-10`}
            />
          </div>
          <label className="relative">
            <span className="sr-only">{t('admin.users.role_filter')}</span>
            <select
              value={role}
              onChange={(event) => setSearchParams((current) => withParams(current, { role: event.target.value === 'all' ? '' : event.target.value, page: 1 }))}
              className={adminSelect}
            >
              <option value="all">{t('admin.users.all_roles')}</option>
              <option value="user">{t('admin.roles.user')}</option>
              <option value="admin">{t('admin.roles.admin')}</option>
              <option value="owner">{t('admin.roles.owner')}</option>
            </select>
            <Chevron />
          </label>
          <label className="relative">
            <span className="sr-only">{t('admin.users.status_filter')}</span>
            <select
              value={status}
              onChange={(event) => setSearchParams((current) => withParams(current, { status: event.target.value === 'all' ? '' : event.target.value, page: 1 }))}
              className={adminSelect}
            >
              <option value="all">{t('admin.users.all_statuses')}</option>
              <option value="active">{t('admin.status.active')}</option>
              <option value="blocked">{t('admin.status.blocked')}</option>
            </select>
            <Chevron />
          </label>
        </div>

        <div className="mt-5" aria-busy={users.isFetching}>
          {users.isError ? (
            <AdminError message={adminErrorText(users.error)} onRetry={() => void users.refetch()} compact />
          ) : users.isLoading ? (
            <AdminLoading />
          ) : total === 0 ? (
            <AdminEmpty
              title={t('admin.users.empty_title')}
              description={urlQuery || role !== 'all' || status !== 'all' ? t('admin.users.empty_desc') : t('admin.common.empty_desc')}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className={`${adminTableHead} uppercase tracking-wide`}>
                      <th
                        scope="col"
                        aria-sort={nameSortActive ? (sort === 'display_name_asc' ? 'ascending' : 'descending') : 'none'}
                        className={`${adminTableHeadCell} w-[40%]`}
                      >
                        <button type="button" onClick={toggleNameSort} className="inline-flex items-center gap-1 hover:text-text-primary">
                          {t('admin.users.col_user')}
                          {nameSortActive
                            ? sort === 'display_name_asc'
                              ? <FiChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                              : <FiChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            : <FiChevronDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />}
                        </button>
                      </th>
                      <th scope="col" className={`${adminTableHeadCell} w-[18%]`}>{t('admin.users.col_role')}</th>
                      <th scope="col" className={`${adminTableHeadCell} w-[17%]`}>{t('admin.users.col_status')}</th>
                      <th scope="col" className={adminTableHeadCell}>{t('admin.users.col_actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data?.items.map((user) => {
                      const disabledReason = editDisabledReason(user)
                      const canDelete = user.role === 'user' && user.id !== session.userId
                      return (
                        <tr key={user.id} className="border-b border-border last:border-0">
                          <td className={adminTableCell}>
                            <p className="text-sm font-medium text-text-primary">{user.display_name}</p>
                            <p className="mt-0.5 text-xs text-text-muted">{user.email}</p>
                          </td>
                          <td className={`${adminTableCell} text-sm text-text-primary`}>
                            {t(`admin.roles.${user.role}`)}
                          </td>
                          <td className={adminTableCell}>
                            <span className={`text-sm font-medium ${user.status === 'blocked' ? 'text-danger' : 'text-success'}`}>
                              {user.status === 'blocked' ? t('admin.status.blocked') : t('admin.status.active')}
                            </span>
                          </td>
                          <td className={adminTableCell}>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(user)}
                                disabled={disabledReason !== null}
                                title={disabledReason ?? undefined}
                                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <FiEdit2 className="h-4 w-4" aria-hidden="true" />
                                {t('admin.users.edit')}
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(user)}
                                  className={adminDangerOutlineButton}
                                >
                                  <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                                  {t('admin.users.delete')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <AdminPagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={(next) => {
                    if (next < 1 || next > totalPages) return
                    setSearchParams((current) => withParams(current, { page: next }))
                  }}
                  onPageSizeChange={(size) => setSearchParams((current) => withParams(current, { page_size: size, page: 1 }))}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-primary">
              <FiClock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">{t('admin.users.journal_title')}</p>
              <p className="text-xs text-text-muted">{t('admin.users.journal_desc')}</p>
            </div>
          </div>
          <Link to="/admin/events" className={adminSecondaryButton}>
            {t('admin.users.journal_open')}
          </Link>
        </div>
      </section>

      <AdminDialog
        open={editing !== null}
        onClose={closeEdit}
        closeDisabled={updateUser.isPending}
        labelledBy={titleId}
        widthClass="max-w-[600px]"
      >
        {editing && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <FiUserPlus className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <h2 id={titleId} className="text-xl font-bold text-text-primary sm:text-2xl">
                  {t('admin.users.edit_title')}
                </h2>
              </div>
              <AdminDialogClose onClick={closeEdit} disabled={updateUser.isPending} />
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-light text-primary">
                  {editing.avatar_url
                    ? <img src={editing.avatar_url} alt="" className="h-full w-full object-cover" />
                    : <FiUser className="h-7 w-7" aria-hidden="true" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-text-primary">{editing.display_name}</p>
                  <p className="truncate text-sm text-text-secondary">
                    {editing.email} · {t('admin.users.id', { id: editing.id })}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <SelectField
                  id="user-role"
                  label={t('admin.users.role_label')}
                  value={roleValue}
                  disabled={session.role !== 'owner' || updateUser.isPending || editing.role === 'owner'}
                  onChange={(event) => setRoleValue(event.target.value === 'admin' ? 'admin' : 'user')}
                  options={EDIT_ROLE_OPTIONS.map((value) => ({ value, label: t(`admin.roles.${value}`) }))}
                  hint={session.role === 'owner' ? t('admin.users.role_hint') : t('admin.users.role_locked')}
                />

                <div>
                  <label htmlFor="user-status" className="mb-1.5 block text-sm font-medium text-text-primary">
                    {t('admin.users.status_label')}
                  </label>
                  <div className="relative">
                    <select
                      id="user-status"
                      value={statusValue}
                      disabled={updateUser.isPending}
                      onChange={(event) => {
                        setStatusValue(event.target.value === 'blocked' ? 'blocked' : 'active')
                        setReasonError(null)
                      }}
                      className={`${adminSelect} pl-10`}
                    >
                      <option value="active">{t('admin.status.active')}</option>
                      <option value="blocked">{t('admin.status.blocked')}</option>
                    </select>
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      {statusValue === 'blocked'
                        ? <span className="text-sm text-danger" aria-hidden="true">⊘</span>
                        : <span className="text-sm text-success" aria-hidden="true">✓</span>}
                    </span>
                    <Chevron />
                  </div>
                  <p className="mt-1.5 text-xs text-text-muted">{t('admin.users.status_hint')}</p>
                </div>

                <TextareaField
                  id="user-reason"
                  label={t('admin.users.reason_label')}
                  value={reason}
                  maxLength={500}
                  rows={3}
                  disabled={updateUser.isPending}
                  placeholder={t('admin.users.reason_placeholder')}
                  error={reasonError ?? undefined}
                  onChange={(event) => {
                    setReason(event.target.value)
                    setReasonError(null)
                    setFormError(null)
                  }}
                />
              </div>

              {formError && (
                <p role="alert" className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
                  {formError}
                </p>
              )}
              {updateUser.isError && (
                <p role="alert" className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
                  {adminErrorText(updateUser.error)}
                </p>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeEdit} disabled={updateUser.isPending} className={adminSecondaryButton}>
                  {t('admin.common.cancel')}
                </button>
                <button type="button" onClick={saveUser} disabled={updateUser.isPending} className={adminPrimaryButton}>
                  {updateUser.isPending ? t('admin.common.saving') : t('admin.users.save')}
                </button>
              </div>
            </div>
          </>
        )}
      </AdminDialog>

      <DeleteConfirmationModal
        open={deleteTarget !== null}
        title={t('admin.users.delete_title')}
        description={(
          <span>
            {t('admin.users.delete_desc_prefix')} <strong className="font-semibold">{deleteTarget?.display_name}</strong>{' '}
            (ID {deleteTarget?.id}).
          </span>
        )}
        warning={t('admin.users.delete_warning')}
        note={t('admin.users.delete_note')}
        confirmLabel={t('admin.users.delete_confirm')}
        pending={deleteUser.isPending}
        error={deleteUser.isError ? adminErrorText(deleteUser.error) : null}
        onCancel={() => { if (!deleteUser.isPending) { setDeleteTarget(null); deleteUser.reset() } }}
        onConfirm={() => { if (deleteTarget && !deleteUser.isPending) deleteUser.mutate({ userId: deleteTarget.id, data: { confirm: true } }) }}
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
