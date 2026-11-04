import { useState, useCallback } from 'react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import { BuilderComponentRow } from '../components/BuilderComponentRow'
import { BuilderSidebar } from '../components/BuilderSidebar'
import { BuilderSpecsTable } from '../components/BuilderSpecsTable'
import { BuilderActions } from '../components/BuilderActions'
import { useBuilderStore, BUILDER_CATEGORIES } from '../stores/builderStore'
import { useCartStore, type BuildCartItem } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiCpu, FiCheckCircle, FiAlertCircle } from 'react-icons/fi'

export function BuilderPage() {
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [buildName] = useState('Сборка ПК')

  const selections = useBuilderStore((s) => s.selections)
  const totalPrice = useBuilderStore((s) => s.totalPrice())
  const estimatedPower = useBuilderStore((s) => s.estimatedPower())
  const clearAll = useBuilderStore((s) => s.clearAll)
  const selectedCount = useBuilderStore((s) => s.selectedCount())
  const hasIncompatibilities = useBuilderStore((s) => s.hasIncompatibilities())
  const isComplete = useBuilderStore((s) => s.isComplete())
  const addBuild = useCartStore((s) => s.addBuild)

  const handleAddToCart = useCallback(() => {
    const components: BuildCartItem['components'] = BUILDER_CATEGORIES
      .map((cat) => {
        const product = selections[cat]
        if (!product) return null
        return {
          category: product.category,
          name: product.name,
          specs: product.specs.slice(0, 3).join(', '),
          quantity: 1,
          image: product.image || placeholder,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)

    addBuild({
      id: Date.now(),
      name: buildName,
      price: totalPrice,
      image: placeholder,
      description: `Сборка из ${selectedCount} компонентов${hasIncompatibilities ? ' (есть несовместимости)' : ''}`,
      category: 'Готовые сборки',
      specs: '',
      components,
    })
  }, [selections, totalPrice, selectedCount, hasIncompatibilities, addBuild, buildName])

  const handleClear = useCallback(() => {
    clearAll()
    setShowClearConfirm(false)
  }, [clearAll])

  const handleSave = useCallback(() => {
    // Reserved for TASK 007 — account-bound saving
    // For now, show a placeholder alert
    alert('Сохранение сборки будет доступно вTASK 007')
  }, [])

  const handleCreate = useCallback(() => {
    // Create a new draft — clear current selections with confirmation
    if (selectedCount > 0) {
      setShowClearConfirm(true)
    } else {
      // Already empty, do nothing or start fresh
    }
  }, [selectedCount])

  return (
    <div className="min-h-screen flex flex-col bg-surface-2">
      <Header />
      <main className="flex-1 pt-24 pb-12 px-4">
        <div className="max-w-[1320px] mx-auto">
          <BackButton className="mb-4" />

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-text-primary">Собери свой ПК</h1>
            <p className="text-text-secondary mt-2">
              Выбирайте <span className="text-text-primary">совместимые</span> компоненты, проверяйте характеристики и рассчитывайте стоимость сборки в реальном времени.
            </p>
          </div>

          {/* Main layout: left (components) + right (sidebar) */}
          <div className="flex gap-8">
            {/* Left column — component rows */}
            <div className="flex-1 min-w-0">
              {/* Component rows */}
              <div className="space-y-3">
                {BUILDER_CATEGORIES.map((category) => (
                  <BuilderComponentRow key={category} category={category} />
                ))}
              </div>

              {/* Specs table */}
              <div className="mt-6">
                <BuilderSpecsTable />
              </div>

              {/* Action buttons */}
              <div className="mt-4 max-w-2xl">
                <BuilderActions
                  onClear={handleClear}
                  onSave={handleSave}
                  onCreate={handleCreate}
                />
              </div>
            </div>

            {/* Right column — sidebar */}
            <div className="w-80 shrink-0">
              <BuilderSidebar onAddToCart={handleAddToCart} />
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Очистить сборку?</h3>
            <p className="text-sm text-text-secondary mb-6">
              Все выбранные компоненты будут удалены. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border border-border bg-surface-2 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-3 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleClear}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
              >
                Очистить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
