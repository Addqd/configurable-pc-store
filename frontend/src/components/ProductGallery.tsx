import { catalogDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import placeholder from '../assets/placeholder.jpg'
import type { EnrichedProduct } from '../data/productDetails'

interface ProductGalleryProps {
  product: EnrichedProduct
}

export function ProductGallery({ product }: ProductGalleryProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  // Server order is already sorted by sort_order; the first image is the cover.
  const images = product.gallery.length > 0 ? product.gallery : [{ url: placeholder }]
  const current = images[active] ?? images[0]

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        <img
          src={current.url}
          alt={current.alt?.trim() || catalogDisplay(product.name)}
          className="aspect-square w-full object-contain"
          onError={(event) => { if (!event.currentTarget.src.endsWith(placeholder)) event.currentTarget.src = placeholder }}
        />
      </div>
      <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
        {images.map((image, index) => (
          <button
            key={`${product.slug}-thumb-${index}`}
            type="button"
            onClick={() => setActive(index)}
            aria-label={t('product.image_show', { index: index + 1, total: images.length })}
            aria-pressed={active === index}
            className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-surface p-1 transition-colors sm:h-20 sm:w-20 ${index === active ? 'border-primary' : 'border-border hover:border-border-hover'}`}
          >
            <img src={image.url} alt="" className="h-full w-full object-contain" onError={(event) => { if (!event.currentTarget.src.endsWith(placeholder)) event.currentTarget.src = placeholder }} />
          </button>
        ))}
      </div>
    </div>
  )
}
