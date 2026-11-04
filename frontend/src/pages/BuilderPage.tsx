import { useEffect, useState } from 'react'
import { Link } from 'react-router'
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

  useEffect(() => { setAddedToCart(false); setCreated(false) }, [selections])
  useEffect(() => {
    if (!confirmAction) return
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setConfirmAction(null) }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [confirmAction])
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
                  hasSelections={count > 0}
                  canCreate={canCreate}
                  validationMessage={validationMessage}
                />
              </div>
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
    </div>
  )
}
