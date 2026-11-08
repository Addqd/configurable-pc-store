import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
import { useBuilderStore, type BuilderCategory } from '../stores/builderStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiRefreshCw, FiTrash2, FiPlus } from 'react-icons/fi'
import { BuilderCategoryIcon } from './BuilderCategoryIcon'
import { BuilderProductSelector } from './BuilderProductSelector'

interface BuilderComponentRowProps { category: BuilderCategory; conflicts?: string[] }

export function BuilderComponentRow({ category, conflicts = [] }: BuilderComponentRowProps) {
  const { t } = useTranslation()
  const [showSelector, setShowSelector] = useState(false)
  const selections = useBuilderStore((state) => state.selections)
  const product = selections[category]
  const removeProduct = useBuilderStore((state) => state.removeProduct)
  const label = t('builder.components.' + category)

  return (
    <>
      <div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-3 transition-colors hover:border-border-hover sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:w-[154px] sm:shrink-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BuilderCategoryIcon category={category} className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-semibold leading-snug text-text-primary">{label}</span>
        </div>

        {product ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <img src={product.image || placeholder} alt={product.name}
                onError={(event) => { if (event.currentTarget.src !== placeholder) event.currentTarget.src = placeholder }}
                className="h-14 w-16 shrink-0 rounded-md bg-surface object-contain" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-text-primary">{catalogDisplay(product.name)}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{product.specs.slice(0, 3).map((part) => catalogDisplay(part)).join(', ')}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <span className="mr-auto whitespace-nowrap text-sm font-bold text-text-primary sm:mr-1">{formatPrice(product.price)}</span>
              <button type="button" onClick={() => setShowSelector(true)}
                aria-label={t('builder.replace_named', { label })}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-primary hover:text-primary">
                <FiRefreshCw className="h-3.5 w-3.5 text-primary" /> {t('builder.replace')}
              </button>
              <button type="button" onClick={() => removeProduct(category)}
                aria-label={t('builder.delete_named', { label })}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-red-400 hover:text-red-500">
                <FiTrash2 className="h-3.5 w-3.5" /> {t('builder.delete')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <span className="text-sm text-text-muted">{t('builder.component_not_selected')}</span>
            <button type="button" onClick={() => setShowSelector(true)}
              aria-label={t('builder.select_named', { label })}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover dark:text-[#08090C]">
              <FiPlus className="h-4 w-4" /> {t('builder.select')}
            </button>
          </div>
        )}
      </div>
      {conflicts.map((message, index) => <p key={`${message}-${index}`} role="alert" className="mt-1 text-xs text-red-500">{message}</p>)}
      </div>
      {showSelector && <BuilderProductSelector category={category} onClose={() => setShowSelector(false)} />}
    </>
  )
}
