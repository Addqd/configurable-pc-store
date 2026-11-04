import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import { useBuilderStore, type SavedBuild } from '../stores/builderStore'
import { useAccountStore, selectActiveAccount } from '../stores/accountStore'
import { useCartStore } from '../stores/cartStore'
import { useUIStore } from '../stores/uiStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiChevronDown, FiChevronUp, FiBox, FiPlus, FiShoppingCart, FiTrash2 } from 'react-icons/fi'

function formatDate(timestamp: number): string {
  const diff = Date.now() - timestamp
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  if (days < 7) return `${days} дн. назад`
  return new Intl.DateTimeFormat('ru-RU').format(new Date(timestamp))
}

function SnapshotImage({ src, alt, className }: { src?: string; alt: string; className: string }) {
  return <img src={src || placeholder} alt={alt} loading="lazy"
    onError={(event) => { event.currentTarget.src = placeholder }}
    className={className} />
}

function SavedComponents({ components }: { components: SavedBuild['components'] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {components.map((comp, index) => (
        <div key={`${comp.category}-${comp.name}-${index}`}
          className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 py-2 border-b border-border last:border-b-0 min-w-0">
          <SnapshotImage src={comp.image} alt="" className="w-10 h-10 object-contain rounded-md bg-surface" />
          <div className="min-w-0">
            <p className="text-xs text-text-muted truncate">{comp.category}</p>
            <p className="text-sm text-text-primary truncate">{comp.name}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function SavedBuildCard({ build, onOpen, onAddToCart, onConfirmDelete }: {
  build: SavedBuild
  onOpen: () => void
  onAddToCart: () => void
  onConfirmDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isCompatible = build.isCompatible

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-[0_8px_32px_var(--color-shadow)] overflow-hidden">
      {/* Card header row */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center p-4 sm:p-5">
        {/* Build PC image */}
        <div className="w-[160px] h-[120px] shrink-0 overflow-hidden rounded-xl bg-surface-2">
          <SnapshotImage src={build.image} alt={build.name} className="w-full h-full object-contain p-3" />
        </div>

        {/* Build details */}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-text-primary truncate">{build.name}</h2>
          <p className="text-sm text-text-muted mt-1 line-clamp-2">{build.description}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2.5">
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isCompatible ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm ${isCompatible ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isCompatible ? 'Совместимая' : 'Есть несовместимости'}
              </span>
            </span>
            <span className="rounded-full bg-surface-3 px-3 py-1 text-xs text-text-muted">
              Сохранено {formatDate(build.savedAt)}
            </span>
          </div>
        </div>

        {/* Price + action buttons */}
        <div className="flex flex-col items-end shrink-0">
          <strong className="text-lg font-bold text-text-primary">{formatPrice(build.totalPrice)}</strong>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button" onClick={onOpen}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white dark:text-[#08090C] px-3.5 py-2 text-sm font-medium hover:bg-primary-hover transition-colors"
            >
              <FiBox className="w-4 h-4" />
              {isCompatible ? 'Открыть' : 'Изменить'}
            </button>
            <button
              type="button"
              disabled={!isCompatible}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border text-text-primary px-3.5 py-2 text-sm hover:bg-surface-3 transition-colors disabled:opacity-50 disabled:cursor-normal"
              onClick={onAddToCart}
            >
              <FiShoppingCart className="w-4 h-4" />
              В корзину
            </button>
            <button
              type="button" onClick={onConfirmDelete}
              className="inline-flex items-center justify-center rounded-lg border border-border text-text-muted p-2 hover:bg-surface-3 hover:text-red-500 transition-colors"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded component section */}
      {expanded ? (
        <div className="border-t border-border bg-surface-2 px-4 sm:px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Состав сборки</h3>
            <button
              type="button" onClick={() => setExpanded(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-border bg-surface text-text-primary hover:bg-surface-3"
              aria-expanded={expanded}
            >
              <FiChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
          <SavedComponents components={build.components} />
        </div>
      ) : (
        <div className="border-t border-border">
          <button
            type="button" onClick={() => setExpanded(true)}
            className="w-full py-3 text-sm text-text-muted flex items-center justify-center gap-2 hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            <FiChevronDown className="w-4 h-4" />
            Показать состав
          </button>
        </div>
      )}
    </article>
  )
}

function EmptyState({ onCreateBuild }: { onCreateBuild: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-12 text-center">
      <FiBox className="w-14 h-14 text-text-muted mx-auto mb-4" />
      <h2 className="text-xl font-bold text-text-primary mb-2">Сборок пока нет</h2>
      <p className="text-text-muted mb-6">Соберите свой ПК в конфигураторе и сохраните конфигурацию.</p>
      <button
        type="button" onClick={onCreateBuild}
        className="inline-flex items-center gap-2 rounded-lg bg-primary text-white dark:text-[#08090C] px-6 py-2.5 font-medium hover:bg-primary-hover"
      >
        <FiPlus className="w-4 h-4" />
        Создать сборку
      </button>
    </div>
  )
}

function SavesContent() {
  const account = useAccountStore(selectActiveAccount)
  const savedBuilds = useBuilderStore((s) => s.savedBuilds)
  const deleteBuild = useBuilderStore((s) => s.deleteSavedBuild)
  const restoreBuild = useBuilderStore((s) => s.restoreBuild)
  const navigate = useNavigate()
  const openAuthModal = useUIStore((s) => s.openAuthModal)
  const addToCart = useCartStore((s) => s.addBuild)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  if (!account) {
    return (
      <main className="min-h-screen bg-surface-2 pt-24 px-4">
        <div className="mx-auto w-full max-w-[1120px]">
          <BackButton className="mb-5" />
          <div className="max-w-md mx-auto w-fit rounded-2xl border border-border bg-surface p-8 text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-2">Мои сборки</h1>
            <p className="text-text-muted mb-6">Войдите в аккаунт, чтобы увидеть свои сборки.</p>
            <button
              type="button" onClick={() => openAuthModal('login')}
              className="rounded-lg bg-primary text-white dark:text-[#08090C] px-6 py-2.5 text-sm font-semibold hover:bg-primary-hover"
            >Войти</button>
          </div>
        </div>
      </main>
    )
  }

  const accountBuilds = savedBuilds.filter((b) => b.ownerId === account.id)
    .sort((a, b) => b.savedAt - a.savedAt)

  const handleDelete = (id: number) => {
    if (deleteId === id) {
      deleteBuild(id)
      setDeleteId(null)
    } else {
      setDeleteId(id)
    }
  }

  const handleCreate = () => {
    navigate('/builder')
  }

  const handleOpen = (id: number) => {
    restoreBuild(id)
    navigate('/builder')
  }

  const handleAddToCart = (build: SavedBuild) => {
    addToCart({
      id: build.id,
      name: build.name,
      price: build.totalPrice,
      image: build.image,
      description: build.description,
      category: 'Готовые сборки',
      specs: '',
      components: build.components,
    })
  }

  return (
    <main className="min-h-screen bg-surface-2 pt-24 px-4 pb-12">
      <div className="max-w-[1120px] mx-auto">
        <BackButton className="mb-5" />
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Мои сборки</h1>
          <button
            type="button" onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-white dark:text-[#08090C] px-5 py-2.5 font-medium hover:bg-primary-hover"
          >
            <FiPlus className="w-4 h-4" />
            Создать сборку
          </button>
        </div>
        {accountBuilds.length === 0 ? (
          <EmptyState onCreateBuild={handleCreate} />
        ) : (
          <div className="space-y-4">
            {accountBuilds.map((build) => (
              <SavedBuildCard
                key={build.id} build={build}
                onOpen={() => handleOpen(build.id)}
                onAddToCart={() => handleAddToCart(build)}
                onConfirmDelete={() => handleDelete(build.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export function SavesPage() {
  const accountId = useAccountStore((s) => s.activeAccountId)
  return (
    <div className="min-h-screen bg-surface-2">
      <Header />
      <SavesContent key={accountId ?? 'guest'} />
      <Footer />
    </div>
  )
}
