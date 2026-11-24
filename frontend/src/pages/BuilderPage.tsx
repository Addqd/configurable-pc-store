import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import { BuilderComponentRow } from '../components/BuilderComponentRow'
import { BuilderSidebar } from '../components/BuilderSidebar'
import { BuilderSpecsTable } from '../components/BuilderSpecsTable'
import { BuilderActions } from '../components/BuilderActions'
import { BuilderConflictsModal } from '../components/BuilderConflictsModal'
import {
  useBuilderStore, BUILDER_CATEGORIES, countSelected, selectionSignature,
  type BuilderSelections,
} from '../stores/builderStore'
import { createBuildApiV1BuildsPost, updateBuildApiV1BuildsBuildIdPut, addBuildApiV1CartBuildsPost, useGetBuildApiV1BuildsBuildIdGet, checkCurrentCompatibilityApiV1BuildsCompatibilityPost } from '../api/generated/client'
import { FiCheckCircle, FiAlertTriangle } from 'react-icons/fi'
import { checkTouchesComponent, compatibilityMessage } from '../data/compatibilityMessages'
import { ApiError } from '../api/transport'
import { BuilderCompatibilitySkeleton } from '../components/skeletons/BuilderSkeletons'

/** Component items of one configuration, the exact payload the server checks. */
function selectionItems(selections: BuilderSelections) {
  return BUILDER_CATEGORIES.flatMap(slot => selections[slot] ? [{ slot, product_id: selections[slot]!.id }] : [])
}

export function BuilderPage() {
  const { t } = useTranslation()
  const [confirmAction, setConfirmAction] = useState<'clear' | null>(null)
  const [addedToCartFor, setAddedToCartFor] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<{ signature: string; message: string } | null>(null)
  const [conflictModalFor, setConflictModalFor] = useState<string | null>(null)
  const [cartError, setCartError] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(t('builder.save_name_placeholder'))
  const [saveDescription, setSaveDescription] = useState('')
  const [saveError, setSaveError] = useState('')
  const openAuthModal = useUIStore((state) => state.openAuthModal)
  const activeAccountId = useAccountStore((state) => state.activeAccountId)
  const editingBuildId = useBuilderStore((state) => state.editingBuildId)
  const selections = useBuilderStore((state) => state.selections)
  const verification = useBuilderStore((state) => state.verification)
  const startVerification = useBuilderStore((state) => state.startVerification)
  const settleVerification = useBuilderStore((state) => state.settleVerification)
  const clearAll = useBuilderStore((state) => state.clearAll)
  const count = countSelected(selections)
  const total = BUILDER_CATEGORIES.length
  const complete = count === total
  const signature = selectionSignature(selections)
  // A verdict belongs to one exact configuration; anything else is not a result.
  const current = verification && verification.signature === signature ? verification : null
  const phase = current?.phase ?? 'idle'
  const checks = current?.checks ?? []
  const checking = phase === 'checking'
  const compatible = phase === 'compatible'
  const incompatible = phase === 'incompatible'
  const conflicts = incompatible ? checks.filter(item => item.status === 'incompatible') : []
  const unresolved = phase === 'unknown' ? checks.filter(item => item.status === 'unknown') : []
  const addedToCart = addedToCartFor === signature
  const saveNotice = savedNotice?.signature === signature ? savedNotice.message : ''
  const showConflicts = conflictModalFor === signature && incompatible && conflicts.length > 0
  const client = useQueryClient()
  const saved = useGetBuildApiV1BuildsBuildIdGet(editingBuildId ?? 0, { query: { enabled: !!activeAccountId && editingBuildId !== null, retry: false } })
  // Only the name/description of the edited build still come from the server; the
  // cart no longer depends on saving the configuration first.
  const items = selectionItems(selections)
  const savedPending = editingBuildId !== null && !!activeAccountId && saved.isPending
  const savedStatus = saved.error instanceof ApiError ? saved.error.status : 0
  const savedMissing = saved.isError && savedStatus === 404
  const savedForbidden = saved.isError && (savedStatus === 401 || savedStatus === 403)
  const messages = (incompatible ? conflicts : unresolved).map(item => compatibilityMessage(item, t))
  const canCreate = complete && !checking
  const missing = BUILDER_CATEGORIES.filter((category) => !selections[category])
  const validationMessage = [
    missing.length > 0 ? t('builder.select_missing', { components: missing.map((category) => t('builder.components.' + category)).join(', ') }) : '',
  ].filter(Boolean).join(' ')
  const addBuild = useMutation({ mutationFn: (buildItems: typeof items) => addBuildApiV1CartBuildsPost({ items: buildItems, quantity: 1 }), onSuccess: () => client.invalidateQueries() })
  const saveMutation = useMutation({ mutationFn: async ({ name, description }: { name: string; description: string }) => {
    if (editingBuildId === null) return createBuildApiV1BuildsPost({ name, description, items })
    return updateBuildApiV1BuildsBuildIdPut(editingBuildId, { name, description, items })
  }, onSettled: () => client.invalidateQueries() })

  const handleAddToCart = async () => {
    // The server re-validates compatibility, stock and prices; this is only the
    // client-side gate that requires an explicit check of these exact selections.
    if (!complete || !compatible || checking) return
    if (!activeAccountId) { openAuthModal('login'); return }
    setCartError('')
    try {
      await addBuild.mutateAsync(selectionItems(selections))
      setAddedToCartFor(signature)
    } catch { setCartError(t('builder.cart_error')) }
  }

  const requestClear = () => {
    if (count > 0) setConfirmAction('clear')
  }

  const handleCreate = async () => {
    // A second submission while a check is in flight is never started.
    if (!canCreate || useBuilderStore.getState().verification?.phase === 'checking') return
    // The submitted configuration is captured now: any later change makes this
    // response outdated instead of silently verifying another build.
    const requested = signature
    const requestedItems = selectionItems(selections)
    setConflictModalFor(null)
    setCartError('')
    startVerification(requested)
    try {
      const result = await checkCurrentCompatibilityApiV1BuildsCompatibilityPost({ items: requestedItems })
      const status = result.overall_status
      settleVerification(requested, status, result.items ?? [])
      const settled = useBuilderStore.getState().verification
      if (settled?.signature === requested && settled.phase === 'incompatible') setConflictModalFor(requested)
    } catch {
      settleVerification(requested, 'failed', [])
    }
  }

  const requestSave = () => {
    if (count === 0) return
    if (!activeAccountId) {
      openAuthModal('login')
      return
    }
    const editing = saved.data
    setSaveName(editing?.name ?? t('builder.save_name_placeholder'))
    setSaveDescription(editing?.description ?? '')
    setSaveError('')
    setSaveOpen(true)
  }

  const submitSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveError('')
    if (!activeAccountId) { setSaveOpen(false); openAuthModal('login'); return }
    if (!saveName.trim()) { setSaveError(t('builder.save_error_required')); return }
    if (saveName.trim().length > 100) { setSaveError(t('builder.save_error_maxlen')); return }
    try {
      const build = await saveMutation.mutateAsync({ name: saveName.trim(), description: saveDescription.trim() })
      if (useAccountStore.getState().activeAccountId !== activeAccountId) return
      useBuilderStore.setState({ editingBuildId: build.id })
      setSaveOpen(false)
      setSavedNotice({ signature, message: t('builder.save_success', { name: saveName.trim() }) })
    } catch (error) {
      setSaveError(error instanceof ApiError && error.status === 409
        ? t('builder.limit_reached')
        : t('builder.save_error_account'))
    }
  }

  const confirmClear = () => {
    // Resets selections, verification and every piece of feedback for them.
    clearAll()
    setAddedToCartFor(null)
    setConflictModalFor(null)
    setCartError('')
    setSavedNotice(null)
    setConfirmAction(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <Header />
      <main className="flex-1 px-4 pb-12 pt-20">
        <div className="mx-auto max-w-[1320px]">
          <BackButton className="mb-4" />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(310px,366px)]">
            <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-[0_5px_24px_var(--color-shadow)] sm:p-5">
              <div className="mb-4">
                <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{t('builder.title')}</h1>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {t('builder.subtitle')}
                </p>
              </div>

              <div className="space-y-2">
                {BUILDER_CATEGORIES.map((category) => <BuilderComponentRow key={category} category={category} conflicts={[...new Set(conflicts.filter(item => checkTouchesComponent(item.slot, category)).map(item => compatibilityMessage(item, t)))]} />)}
              </div>

              <div className="mt-3"><BuilderSpecsTable /></div>
              <div className="mt-3">
                <BuilderActions
                  onCreate={() => { void handleCreate() }}
                  onClear={requestClear}
                  onSave={requestSave}
                  hasSelections={count > 0 || editingBuildId !== null}
                  canCreate={canCreate}
                  canSave={count > 0 && !savedPending}
                  validationMessage={validationMessage}
                />
              </div>
              {savedPending && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-3">
                  <BuilderCompatibilitySkeleton testId="builder-saved-build-skeleton" />
                </div>
              )}
              {editingBuildId !== null && saved.isError && (
                <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm text-text-primary">
                  <span>{savedMissing
                    ? t('builder.saved_build_missing')
                    : savedForbidden ? t('builder.saved_build_forbidden') : t('common.load_error')}</span>
                  {!savedMissing && !savedForbidden && (
                    <button type="button" onClick={() => void saved.refetch()}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-sm font-medium text-text-primary hover:border-border-hover">{t('common.retry')}</button>
                  )}
                </div>
              )}
              {incompatible && (
                <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-text-primary">
                  <FiAlertTriangle className="shrink-0 text-red-500" />
                  <span className="text-red-500">{t('builder.conflict_notice', { count: conflicts.length })}</span>
                  <button type="button" onClick={() => setConflictModalFor(signature)}
                    className="rounded-md border border-red-500/40 bg-surface px-3 py-1 text-sm font-medium text-text-primary hover:border-red-500">
                    {t('builder.conflict_notice_details')}
                  </button>
                </div>
              )}
              {phase === 'unknown' && (
                <div role="alert" className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  {t('builder.unknown_notice', { count: unresolved.length })}
                </div>
              )}
              {phase === 'failed' && (
                <div role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                  {t('builder.check_failed')}
                </div>
              )}
              {compatible && (
                <div role="status" className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" />{t('builder.build_ready')}
                </div>
              )}
              {cartError && (
                <div role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
                  {cartError}
                </div>
              )}
              {saveNotice && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" />{saveNotice}
                  <Link to="/builds" className="font-semibold text-primary hover:underline">{t('builder.saved_builds')}</Link>
                </div>
              )}
              {addedToCart && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" /> {t('builder.added_to_cart')}
                  <Link to="/cart" className="font-semibold text-primary hover:underline">{t('builder.view_cart')}</Link>
                </div>
              )}
            </section>
            <BuilderSidebar onAddToCart={() => { void handleAddToCart() }} status={compatible ? 'compatible' : incompatible ? 'incompatible' : 'unknown'}
              canAdd={compatible} checked={phase === 'compatible' || phase === 'incompatible' || phase === 'unknown'}
              loading={checking} error={phase === 'failed'} messages={messages} />
          </div>
        </div>
      </main>
      <Footer />

      {showConflicts && <BuilderConflictsModal conflicts={conflicts} onClose={() => setConflictModalFor(null)} />}
      {confirmAction && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmAction(null) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="builder-confirm-title"
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h2 id="builder-confirm-title" className="mb-2 text-lg font-bold text-text-primary">
              {t('builder.clear_title')}
            </h2>
            <p className="mb-6 text-sm text-text-muted">{t('builder.clear_desc')}</p>
            <div className="flex gap-3">
              <button type="button" autoFocus onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary hover:bg-surface-3">{t('builder.cancel')}</button>
              <button type="button" onClick={confirmClear}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                {t('builder.clear')}
              </button>
            </div>
          </div>
        </div>
      )}
      {saveOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSaveOpen(false) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="builder-save-title"
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h2 id="builder-save-title" className="mb-4 text-lg font-bold text-text-primary">
              {editingBuildId !== null ? t('builder.save_changes') : t('builder.save_build')}
            </h2>
            <form onSubmit={submitSave} className="space-y-4" noValidate>
              <div>
                <label htmlFor="build-save-name" className="mb-1.5 block text-sm font-medium text-text-primary">{t('builder.save_name_label')}</label>
                <input id="build-save-name" autoFocus value={saveName} onChange={(event) => { setSaveName(event.target.value); setSaveError('') }}
                  maxLength={101} placeholder={t('builder.save_name_placeholder')} aria-invalid={Boolean(saveError)} aria-describedby={saveError ? "build-save-error" : undefined}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" />
                {saveError && <p id="build-save-error" role="alert" className="mt-1 text-xs text-red-500">{saveError}</p>}
              </div>
              <div>
                <label htmlFor="build-save-description" className="mb-1.5 block text-sm font-medium text-text-primary">{t('builder.save_desc_label')}</label>
                <textarea id="build-save-description" value={saveDescription} maxLength={300}
                  onChange={(event) => setSaveDescription(event.target.value)} rows={3}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => setSaveOpen(false)} className="rounded-lg border border-border px-4 py-2 text-text-primary hover:bg-surface-3">{t('builder.cancel')}</button>
                <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover dark:text-[#08090C]">{t('builder.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
