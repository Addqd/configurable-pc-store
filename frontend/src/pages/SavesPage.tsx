import { relativeSavedDate } from '../i18n/format'
import { catalogDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import {
  useBuilderStore, countSelected, emptyBuilderSelections, BUILDER_CATEGORIES, CATEGORY_LABELS, type BuilderCategory,
} from '../stores/builderStore'
import type { BuildComponent } from '../stores/cartStore'
import type { SavedBuildOut } from '../api/generated/model'
import { useListBuildsApiV1BuildsGet, useCheckCompatibilityApiV1BuildsBuildIdCompatibilityGet, deleteBuildApiV1BuildsBuildIdDelete, addBuildApiV1CartBuildsPost, getProductApiV1ProductsSlugGet } from '../api/generated/client'
import { productFromDetail } from '../api/catalogAdapter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccountStore, selectActiveAccount } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiBox, FiPlus, FiShoppingCart, FiTrash2, FiFolder, FiCheckCircle } from 'react-icons/fi'

function SnapshotImage({ src, alt, className }: { src?: string; alt: string; className: string }) {
  return <img src={src || placeholder} alt={alt} loading="lazy"
    onError={(event) => { if (event.currentTarget.src !== new URL(placeholder, window.location.href).href) event.currentTarget.src = placeholder }}
    className={className} />
}

function SavedComponents({ components }: { components: BuildComponent[] }) {
  const referenceOrder = [
    'Видеокарта', 'Процессор', 'Материнская плата', 'Оперативная память',
    'Накопитель', 'Блок питания', 'Корпус', 'Охлаждение',
  ]
  const ordered = [...components].sort((a, b) =>
    referenceOrder.indexOf(a.category) - referenceOrder.indexOf(b.category))
  return (
    <div className="grid grid-cols-1 gap-x-6 md:grid-flow-col md:grid-rows-4 md:grid-cols-2">
      {ordered.map((component, index) => (
        <div key={`${component.category}-${component.name}-${index}`}
          className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-2 border-b border-border py-1.5 sm:grid-cols-[40px_minmax(0,1fr)]">
          <SnapshotImage src={component.image} alt="" className="h-9 w-9 rounded-md bg-surface object-contain sm:h-10 sm:w-10" />
          <div className="grid min-w-0 gap-0.5 sm:grid-cols-[minmax(100px,0.85fr)_minmax(0,1.7fr)] sm:items-center sm:gap-3">
            <span className="text-xs text-text-muted">{catalogDisplay(component.category)}</span>
            <span className="break-words text-xs font-medium text-text-primary sm:text-sm">{component.name}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function SavedBuildCard({ build, onOpen, onAddToCart, onDelete }: {
  build: SavedBuildOut
  onOpen: () => void
  onAddToCart: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true) // Reference shows the component composition.
  const check = useCheckCompatibilityApiV1BuildsBuildIdCompatibilityGet(build.id, { query: { retry: false } })
  const conflict = check.data?.overall_status === 'incompatible'
  const unknown = check.data?.overall_status !== 'compatible' && !conflict
  const components = (build.items ?? []).map(item => ({ category: CATEGORY_LABELS[item.slot as BuilderCategory] ?? item.slot, name: item.product_name, specs: '', quantity: 1 }))
  const total = (build.items ?? []).reduce((sum, item) => sum + Number(item.price), 0)

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-[0_5px_24px_var(--color-shadow)] sm:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="h-[104px] w-[136px] shrink-0 overflow-hidden rounded-lg bg-surface-2">
          <SnapshotImage src={build.image_url ?? undefined} alt={build.name} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-bold text-text-primary sm:text-lg">{build.name}</h2>
          {build.description && <p className="mt-1 line-clamp-2 text-sm text-text-muted">{build.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-medium ${conflict ? 'text-red-500' : unknown ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              <span className={`h-2 w-2 rounded-full ${conflict ? 'bg-red-500' : unknown ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {conflict ? t('saved_builds.compatibility_check') : unknown ? t('saved_builds.compatibility_partial') : t('saved_builds.compatibility_ok')}
            </span>
            <span className="rounded-md border border-border bg-surface-2 px-2 py-1 text-text-muted">{t('saved_builds.saved_at', { date: relativeSavedDate(Date.parse(build.created_at)) })}</span>
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <strong className="mr-1 whitespace-nowrap text-xl font-bold text-text-primary">{formatPrice(total)}</strong>
          <button type="button" onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover dark:text-[#08090C]">
            <FiFolder className="h-4 w-4" /> {t('saved_builds.open')}
          </button>
          <button type="button" onClick={onAddToCart} disabled={conflict || unknown}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface-2">
            <FiShoppingCart className="h-4 w-4" /> {t('saved_builds.add_cart')}
          </button>
          <button type="button" aria-label={t('saved_builds.delete_named', { name: build.name })} onClick={onDelete}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-red-500 hover:text-red-500">
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface-2">
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-bold text-text-primary hover:bg-surface-3">
          {t('saved_builds.build_composition')} <span aria-hidden="true" className="text-text-muted">{expanded ? '⌃' : '⌄'}</span>
        </button>
        {expanded && <div className="border-t border-border px-3 pb-2"><SavedComponents components={components} /></div>}
      </div>
    </article>
  )
}

function SavesContent() {
  const { t } = useTranslation()
  const account = useAccountStore(selectActiveAccount)
  const savedBuilds = useListBuildsApiV1BuildsGet({ query: { enabled: !!account, retry: false } })
  const client = useQueryClient()
  const addBuild = useMutation({ mutationFn: (id: number) => addBuildApiV1CartBuildsPost({ saved_build_id: id, quantity: 1 }), onSuccess: () => client.invalidateQueries() })
  const deleteBuild = useMutation({ mutationFn: (id: number) => deleteBuildApiV1BuildsBuildIdDelete(id), onSuccess: () => client.invalidateQueries() })
  const startNewBuild = useBuilderStore((state) => state.startNewBuild)
  const openAuthModal = useUIStore((state) => state.openAuthModal)
  const navigate = useNavigate()
  const [pendingDelete, setPendingDelete] = useState<SavedBuildOut | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pendingDelete && !confirmNew) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPendingDelete(null); setConfirmNew(false) }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [pendingDelete, confirmNew])

  if (!account) {
    return (
      <main className="min-h-screen bg-surface-2 px-4 pt-24">
        <div className="mx-auto max-w-[1120px]">
          <BackButton className="mb-5" />
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
            <h1 className="mb-2 text-2xl font-bold text-text-primary">{t('saved_builds.title')}</h1>
            <p className="mb-6 text-text-muted">{t('saved_builds.login_desc')}</p>
            <button type="button" onClick={() => openAuthModal('login')}
              className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white hover:bg-primary-hover dark:text-[#08090C]">{t('saved_builds.login_btn')}</button>
          </div>
        </div>
      </main>
    )
  }

  const builds = [...(savedBuilds.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const startFresh = () => {
    startNewBuild()
    setConfirmNew(false)
    navigate('/builder')
  }
  const newBuild = () => {
    // Opening a new build must not silently discard the current unsaved draft.
    if (countSelected(useBuilderStore.getState().selections) > 0) setConfirmNew(true)
    else startFresh()
  }
  const openBuild = async (build: SavedBuildOut) => {
    setError('')
    try {
      const selections = emptyBuilderSelections()
      await Promise.all((build.items ?? []).map(async item => {
        if (!BUILDER_CATEGORIES.includes(item.slot as BuilderCategory)) throw new Error('Unknown slot')
        const product = await getProductApiV1ProductsSlugGet(item.product_slug)
        if (product.id !== item.product_id) throw new Error('Product mismatch')
        selections[item.slot as BuilderCategory] = productFromDetail(product)
      }))
      if (useAccountStore.getState().activeAccountId !== account.id) return
      useBuilderStore.setState({ selections, editingBuildId: build.id })
      navigate('/builder')
    } catch { setError(t('saved_builds.restore_error', { name: build.name })) }
  }
  const addToCart = async (build: SavedBuildOut) => {
    try { await addBuild.mutateAsync(build.id); setError(''); setMessage(t('saved_builds.add_success', { name: build.name })) }
    catch { setError(t('saved_builds.add_error')) }
  }
  const confirmDelete = async () => {
    if (!pendingDelete) return
    try { await deleteBuild.mutateAsync(pendingDelete.id); setError(''); setMessage(t('saved_builds.delete_success')) }
    catch { setError(t('saved_builds.delete_account_error')) }
    setPendingDelete(null)
  }

  return (
    <main className="min-h-screen bg-surface-2 px-4 pb-12 pt-24">
      <div className="mx-auto max-w-[1120px]">
        <BackButton className="mb-5" />
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-text-primary">{t('saved_builds.title')}</h1>
          <button type="button" onClick={newBuild} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover dark:text-[#08090C]">
            <FiPlus /> {t('saved_builds.create')}
          </button>
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-red-500">{error}</p>}
        {message && <p role="status" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"><FiCheckCircle />{message} <Link to="/cart" className="text-primary hover:underline">{t('saved_builds.open_cart')}</Link></p>}
        {savedBuilds.isError ? <p role="alert">{t('common.load_error')}</p> : savedBuilds.isLoading ? <p role="status">{t('common.loading')}</p> : builds.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-12 text-center">
            <FiBox className="mx-auto mb-4 h-14 w-14 text-text-muted" />
            <h2 className="mb-2 text-xl font-bold text-text-primary">{t('saved_builds.empty_title')}</h2>
            <p className="mb-6 text-text-muted">{t('saved_builds.empty_desc')}</p>
            <button type="button" onClick={newBuild} className="rounded-lg bg-primary px-6 py-2.5 text-white hover:bg-primary-hover dark:text-[#08090C]">{t('saved_builds.empty_btn')}</button>
          </div>
        ) : (
          <div className="space-y-4">
            {builds.map((build) => (
              <SavedBuildCard key={build.id} build={build} onOpen={() => openBuild(build)} onAddToCart={() => addToCart(build)} onDelete={() => setPendingDelete(build)} />
            ))}
          </div>
        )}
      </div>
      {confirmNew && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmNew(false) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="new-saved-build-title"
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h2 id="new-saved-build-title" className="mb-3 text-lg font-bold text-text-primary">{t('saved_builds.create_new_title')}</h2>
            <p className="mb-5 text-sm text-text-muted">{t('saved_builds.create_new_desc')}</p>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" autoFocus onClick={() => setConfirmNew(false)} className="rounded-lg border border-border px-4 py-2 text-text-primary hover:bg-surface-3">{t('builder.cancel')}</button>
              <button type="button" onClick={startFresh} className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover dark:text-[#08090C]">{t('saved_builds.create_new_btn')}</button>
            </div>
          </div>
        </div>
      )}
      {pendingDelete && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null) }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-saved-build-title" className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h2 id="delete-saved-build-title" className="mb-3 text-lg font-bold text-text-primary">{t('saved_builds.delete_title')}</h2>
            <p className="mb-5 break-words text-sm text-text-muted">{t('saved_builds.delete_desc', { name: pendingDelete.name })}</p>
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" autoFocus onClick={() => setPendingDelete(null)} className="rounded-lg border border-border px-4 py-2 text-text-primary hover:bg-surface-3">{t('builder.cancel')}</button>
              <button type="button" onClick={confirmDelete} className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700">{t('saved_builds.delete_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export function SavesPage() {
  const accountId = useAccountStore((state) => state.activeAccountId)
  return <div className="min-h-screen bg-surface-2"><Header /><SavesContent key={accountId ?? 'guest'} /><Footer /></div>
}
