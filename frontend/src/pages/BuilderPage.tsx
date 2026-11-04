import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
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
  useBuilderStore, BUILDER_CATEGORIES, CATEGORY_LABELS, countSelected,
  checkBuildCompatibility, isBuildCartEligible, createBuildCartPayload,
} from '../stores/builderStore'
import { useCartStore } from '../stores/cartStore'
import placeholder from '../assets/placeholder.jpg'
import { FiCheckCircle } from 'react-icons/fi'

export function BuilderPage() {
  const [confirmAction, setConfirmAction] = useState<'clear' | null>(null)
  const [addedToCart, setAddedToCart] = useState(false)
  const [created, setCreated] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('Сборка ПК')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveNotice, setSaveNotice] = useState('')
  const openAuthModal = useUIStore((state) => state.openAuthModal)
  const activeAccountId = useAccountStore((state) => state.activeAccountId)
  const editingBuildId = useBuilderStore((state) => state.editingBuildId)
  const saveBuild = useBuilderStore((state) => state.saveBuild)
  const selections = useBuilderStore((state) => state.selections)
  const clearAll = useBuilderStore((state) => state.clearAll)
  const count = countSelected(selections)
  const canCreate = isBuildCartEligible(selections)
  const missing = BUILDER_CATEGORIES.filter((category) => !selections[category])
  const conflicts = checkBuildCompatibility(selections).filter((check) => check.status === 'incompatible')
  const validationMessage = [
    missing.length > 0 ? `Выберите комплектующие: ${missing.map((category) => CATEGORY_LABELS[category]).join(', ')}.` : '',
    conflicts.length > 0 ? `Исправьте несовместимость: ${conflicts.map((check) => check.label).join(', ')}.` : '',
  ].filter(Boolean).join(' ')

  useEffect(() => { setAddedToCart(false); setCreated(false); setSaveNotice('') }, [selections])
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
  const addBuild = useCartStore((state) => state.addBuild)

  const handleAddToCart = () => {
    // Read the latest state and revalidate at the action boundary, not just at render time.
    const current = useBuilderStore.getState().selections
    const cartItems = useCartStore.getState().items
    let id = Date.now()
    while (cartItems.some((item) => item.id === id)) id += 1
    const payload = createBuildCartPayload(current, id, placeholder)
    if (!payload) return
    addBuild(payload)
    setAddedToCart(true)
  }

  const requestClear = () => {
    if (count > 0) setConfirmAction('clear')
  }

  // 'Создать сборку' confirms an assembled draft; it must not erase the user's
  // finished selection. Account-bound persistence is reserved for TASK 007.
  const handleCreate = () => {
    if (!isBuildCartEligible(useBuilderStore.getState().selections)) return
    setCreated(true)
  }

  const requestSave = () => {
    if (!isBuildCartEligible(useBuilderStore.getState().selections)) return
    if (!activeAccountId) {
      openAuthModal('login')
      return
    }
    const editing = editingBuildId === null ? undefined :
      useBuilderStore.getState().getSavedBuild(editingBuildId, activeAccountId)
    setSaveName(editing?.name ?? 'Сборка ПК')
    setSaveDescription(editing?.description ?? '')
    setSaveError('')
    setSaveOpen(true)
  }

  const submitSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveError('')
    if (!activeAccountId) { setSaveOpen(false); openAuthModal('login'); return }
    if (!saveName.trim()) { setSaveError('Введите название сборки.'); return }
    if (saveName.trim().length > 100) { setSaveError('Название не должно превышать 100 символов.'); return }
    const build = saveBuild(saveName, saveDescription, placeholder, activeAccountId)
    if (!build) {
      setSaveError('Не удалось сохранить сборку. Проверьте комплектующие и текущий аккаунт.')
      return
    }
    setSaveOpen(false)
    setSaveNotice(`Сборка «${build.name}» сохранена.`)
  }

  const confirmClear = () => {
    clearAll()
    setAddedToCart(false)
    setCreated(false)
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
                <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Собери свой ПК</h1>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  Выбирайте совместимые компоненты, проверяйте характеристики и рассчитывайте стоимость сборки в реальном времени.
                </p>
              </div>

              <div className="space-y-2">
                {BUILDER_CATEGORIES.map((category) => <BuilderComponentRow key={category} category={category} />)}
              </div>

              <div className="mt-3"><BuilderSpecsTable /></div>
              <div className="mt-3">
                <BuilderActions
                  onCreate={handleCreate}
                  onClear={requestClear}
                  onSave={requestSave}
                  hasSelections={count > 0 || editingBuildId !== null}
                  canCreate={canCreate}
                  validationMessage={validationMessage}
                />
              </div>
              {saveNotice && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" />{saveNotice}
                  <Link to="/builds" className="font-semibold text-primary hover:underline">Мои сборки</Link>
                </div>
              )}
              {created && (
                <div role="status" className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  Сборка готова. Теперь её можно добавить в корзину.
                </div>
              )}
              {addedToCart && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-text-primary">
                  <FiCheckCircle className="text-emerald-500" /> Сборка добавлена в корзину.
                  <Link to="/cart" className="font-semibold text-primary hover:underline">Перейти в корзину</Link>
                </div>
              )}
            </section>
            <BuilderSidebar onAddToCart={handleAddToCart} />
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
              Очистить сборку?
            </h2>
            <p className="mb-6 text-sm text-text-muted">Все выбранные комплектующие будут удалены. Это действие нельзя отменить.</p>
            <div className="flex gap-3">
              <button type="button" autoFocus onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary hover:bg-surface-3">Отмена</button>
              <button type="button" onClick={confirmClear}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                Очистить
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
              {editingBuildId !== null ? 'Сохранить изменения сборки' : 'Сохранить сборку'}
            </h2>
            <form onSubmit={submitSave} className="space-y-4" noValidate>
              <div>
                <label htmlFor="build-save-name" className="mb-1.5 block text-sm font-medium text-text-primary">Название</label>
                <input id="build-save-name" autoFocus value={saveName} onChange={(event) => { setSaveName(event.target.value); setSaveError('') }}
                  maxLength={101} placeholder="Название сборки" aria-invalid={Boolean(saveError)} aria-describedby={saveError ? "build-save-error" : undefined}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" />
                {saveError && <p id="build-save-error" role="alert" className="mt-1 text-xs text-red-500">{saveError}</p>}
              </div>
              <div>
                <label htmlFor="build-save-description" className="mb-1.5 block text-sm font-medium text-text-primary">Описание (необязательно)</label>
                <textarea id="build-save-description" value={saveDescription} maxLength={300}
                  onChange={(event) => setSaveDescription(event.target.value)} rows={3}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => setSaveOpen(false)} className="rounded-lg border border-border px-4 py-2 text-text-primary hover:bg-surface-3">Отмена</button>
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover dark:text-[#08090C]">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
