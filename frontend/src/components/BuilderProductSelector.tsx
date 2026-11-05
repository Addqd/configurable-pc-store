import { catalogDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useBuilderStore, CATEGORY_LABELS, getProductsForCategory, type BuilderCategory } from '../stores/builderStore'
import type { Product } from '../data/mockProducts'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiX, FiSearch, FiCheck } from 'react-icons/fi'

interface BuilderProductSelectorProps { category: BuilderCategory; onClose: () => void }

export function BuilderProductSelector({ category, onClose }: BuilderProductSelectorProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const setProduct = useBuilderStore((state) => state.setProduct)
  const selected = useBuilderStore((state) => state.selections[category])

  useEffect(() => {
    const focusedBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
        .filter((item) => item.getClientRects().length > 0)
      if (!focusables.length) return
      const first = focusables[0], last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKeyDown)
      focusedBeforeOpen?.focus()
    }
  }, [onClose])

  const query = search.trim().toLocaleLowerCase('ru-RU')
  const products = getProductsForCategory(category)
  const filtered = products.filter((product) => !query ||
    [product.name, product.manufacturer, ...product.specs].some((part) => part.toLocaleLowerCase('ru-RU').includes(query)))
  const hasSearchError = query.length > 0 && filtered.length === 0

  const handleSelect = (product: Product) => {
    setProduct(category, product)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="builder-selector-title"
        className="flex w-full max-w-[720px] max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h2 id="builder-selector-title" className="text-lg font-bold text-text-primary">{t('builder.components.' + category)}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-2 text-text-muted hover:bg-surface-3 hover:text-text-primary"><FiX /></button>
        </div>
        <div className="shrink-0 p-4 pb-2 sm:px-6">
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
            <input ref={inputRef} value={search} onChange={(event) => setSearch(event.target.value)}
              type="search" placeholder={t('builder.search_placeholder')}
              aria-invalid={hasSearchError}
              aria-describedby={hasSearchError ? 'builder-selector-search-error' : undefined}
              className={`h-10 w-full rounded-lg border bg-surface-2 pl-10 pr-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 ${hasSearchError ? 'border-red-500 focus:ring-red-500' : 'border-border focus:ring-primary'}`} />
          </div>
          {hasSearchError && (
            <p id="builder-selector-search-error" role="alert" className="mt-2 text-xs text-red-500">
              {t('builder.search_no_results')}
            </p>
          )}
        </div>
        {/* The list has its own fixed desktop height and a permanently scrollable track;
            on short screens it shrinks to remain fully reachable. */}
        <div data-testid="builder-products-scroll" className="h-[400px] max-h-[calc(100dvh-230px)] min-h-0 shrink overflow-y-scroll overscroll-contain px-4 py-3 sm:px-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border-hover [&::-webkit-scrollbar-track]:bg-surface-2" style={{ scrollbarGutter: 'stable' }}>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-muted">
              {t('builder.no_results_default')}
              {search && <button type="button" onClick={() => setSearch('')} className="ml-2 text-primary hover:underline">{t('builder.search_reset')}</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((product) => (
                <button type="button" key={product.id} onClick={() => handleSelect(product)}
                  className={`flex w-full min-w-0 flex-wrap items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary hover:bg-surface-3 sm:flex-nowrap ${selected?.id === product.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <img src={product.image || placeholder} alt="" loading="lazy"
                    onError={(event) => { if (event.currentTarget.src !== placeholder) event.currentTarget.src = placeholder }}
                    className="h-14 w-14 shrink-0 rounded-md bg-surface-2 object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-text-primary">{product.name}</span>
                    <span className="mt-1 block text-xs text-text-muted">{product.specs.slice(0, 3).map((spec) => catalogDisplay(spec)).join(', ')}</span>
                  </span>
                  <span className="whitespace-nowrap text-sm font-bold text-text-primary">{formatPrice(product.price)}</span>
                  {selected?.id === product.id && <FiCheck className="shrink-0 text-primary" aria-label={t('builder.selected')} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t border-border px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-text-primary hover:bg-surface-3">{t('builder.cancel')}</button>
        </div>
      </div>
    </div>
  )
}
