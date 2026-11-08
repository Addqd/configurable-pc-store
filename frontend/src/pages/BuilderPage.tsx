import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import { BuilderComponentRow } from '../components/BuilderComponentRow'
import { BuilderSidebar } from '../components/BuilderSidebar'
import { BuilderSpecsTable } from '../components/BuilderSpecsTable'
import { BuilderActions } from '../components/BuilderActions'
import {
  useBuilderStore, BUILDER_CATEGORIES, countSelected, type BuilderSelections,
} from '../stores/builderStore'
import { createBuildApiV1BuildsPost, updateBuildApiV1BuildsBuildIdPut, addBuildApiV1CartBuildsPost, useGetBuildApiV1BuildsBuildIdGet, checkCurrentCompatibilityApiV1BuildsCompatibilityPost } from '../api/generated/client'
import { FiCheckCircle } from 'react-icons/fi'

export function BuilderPage() {
  const { t } = useTranslation()
  const [confirmAction, setConfirmAction] = useState<'clear' | null>(null)
  const [addedToCartFor, setAddedToCartFor] = useState<BuilderSelections | null>(null)
  const [createdFor, setCreatedFor] = useState<BuilderSelections | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState(t('builder.save_name_placeholder'))
  const [saveDescription, setSaveDescription] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedNotice, setSavedNotice] = useState<{ selections: BuilderSelections; message: string } | null>(null)
  const openAuthModal = useUIStore((state) => state.openAuthModal)
  const activeAccountId = useAccountStore((state) => state.activeAccountId)
  const editingBuildId = useBuilderStore((state) => state.editingBuildId)
  const selections = useBuilderStore((state) => state.selections)
  const addedToCart = addedToCartFor === selections
  const created = createdFor === selections
  const saveNotice = savedNotice?.selections === selections ? savedNotice.message : ''
  const clearAll = useBuilderStore((state) => state.clearAll)
  const count = countSelected(selections)
  const client = useQueryClient()
  const saved = useGetBuildApiV1BuildsBuildIdGet(editingBuildId ?? 0, { query: { enabled: !!activeAccountId && editingBuildId !== null, retry: false } })
  const matchesSaved = !!saved.data && (saved.data.items ?? []).length === count && BUILDER_CATEGORIES.every(slot =>
    (selections[slot]?.id ?? null) === ((saved.data?.items ?? []).find(item => item.slot === slot)?.product_id ?? null))
  const items = BUILDER_CATEGORIES.flatMap(slot => selections[slot] ? [{ slot, product_id: selections[slot]!.id }] : [])
  const compatibility = useQuery({ queryKey: ['current-compatibility', items], enabled: count > 0, retry: false,
    queryFn: ({ signal }) => checkCurrentCompatibilityApiV1BuildsCompatibilityPost({ items }, { signal }) })
  const status = compatibility.isSuccess && !compatibility.isFetching ? compatibility.data.overall_status : 'unknown'
  const canCreate = count > 0
  const missing = BUILDER_CATEGORIES.filter((category) => !selections[category])
  const validationMessage = [
    missing.length > 0 ? t('builder.select_missing', { components: missing.map((category) => t('builder.components.' + category)).join(', ') }) : '',
  ].filter(Boolean).join(' ')

  useEffect(() => {
    if (!confirmAction) return
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setConfirmAction(null) }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [confirmAction])
  useEffect(() => {
    if (!saveOpen) return
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSaveOpen(false) }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [saveOpen])
  const addBuild = useMutation({ mutationFn: (id: number) => addBuildApiV1CartBuildsPost({ saved_build_id: id, quantity: 1 }), onSuccess: () => client.invalidateQueries() })
  const saveMutation = useMutation({ mutationFn: async ({ name, description }: { name: string; description: string }) => {
    const items = BUILDER_CATEGORIES.flatMap(slot => selections[slot] ? [{ slot, product_id: selections[slot]!.id }] : [])
    if (editingBuildId === null) return createBuildApiV1BuildsPost({ name, description, items })
    return updateBuildApiV1BuildsBuildIdPut(editingBuildId, { name, description, items })
  }, onSettled: () => client.invalidateQueries() })

  const handleAddToCart = async () => {
    if (editingBuildId === null || status !== 'compatible' || !matchesSaved) return
    try { await addBuild.mutateAsync(editingBuildId); setAddedToCartFor(selections) }
    catch { setSaveError(t('common.load_error')) }
  }

  const requestClear = () => {
    if (count > 0) setConfirmAction('clear')
  }

  const handleCreate = () => {
    if (status !== 'compatible') return
    setCreatedFor(selections)
  }

  const requestSave = () => {
    if (!canCreate) return
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
      setSavedNotice({ selections, message: t('builder.save_success', { name: saveName.trim() }) })
    } catch { setSaveError(t('builder.save_error_account')) }
  }

  const confirmClear = () => {
    clearAll()
    setAddedToCartFor(null)
    setCreatedFor(null)
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
                {BUILDER_CATEGORIES.map((category) => <BuilderComponentRow key={category} category={category} conflicts={(compatibility.data?.items ?? []).filter(item => item.status === 'incompatible' && item.slot.split('+').some(part => part === category || part.startsWith(`${category}_`))).map(item => item.message ?? item.slot)} />)}
              </div>

              <div className="mt-3"><BuilderSpecsTable /></div>
              <div className="mt-3">
                <BuilderActions
                  onCreate={handleCreate}
                  onClear={requestClear}
                  onSave={requestSave}
                  hasSelections={count > 0 || editingBuildId !== null}
                  canCreate={status === 'compatible'}
                  canSave={canCreate}
                  validationMessage={validationMessage}
                />
              </div>
              {saveNotice && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" />{saveNotice}
                  <Link to="/builds" className="font-semibold text-primary hover:underline">{t('builder.saved_builds')}</Link>
                </div>
              )}
              {created && (
                <div role="status" className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  {t('builder.build_ready')}
                </div>
              )}
              {addedToCart && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" /> {t('builder.added_to_cart')}
                  <Link to="/cart" className="font-semibold text-primary hover:underline">{t('builder.view_cart')}</Link>
                </div>
              )}
            </section>
            <BuilderSidebar onAddToCart={handleAddToCart} status={status} canAdd={matchesSaved} checked={compatibility.isSuccess} loading={compatibility.isFetching} error={compatibility.isError} messages={(compatibility.data?.items ?? []).filter(item => item.status !== 'compatible').map(item => item.message ?? item.product_name)} />
          </div>
        </div>
      </main>
      <Footer />

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
