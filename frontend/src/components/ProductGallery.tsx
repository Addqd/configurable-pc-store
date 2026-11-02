import { useState } from 'react'
import placeholder from '../assets/placeholder.jpg'
import type { EnrichedProduct } from '../data/productDetails'

interface ProductGalleryProps {
  product: EnrichedProduct
}

export function ProductGallery({ product }: ProductGalleryProps) {
  const [active, setActive] = useState(0)
  const images = product.gallery.length > 0 ? product.gallery : [placeholder]
  const current = images[active] ?? images[0]

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        <img
          src={current}
          alt={product.name}
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
            aria-label={`Показать изображение ${index + 1} из ${images.length}`}
            aria-pressed={active === index}
            className={`pc-hover-outline h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-surface p-1 transition-colors sm:h-20 sm:w-20 ${index === active ? 'border-primary' : 'border-border hover:border-border-hover'}`}
          >
            <img src={image} alt="" className="h-full w-full object-contain" onError={(event) => { if (!event.currentTarget.src.endsWith(placeholder)) event.currentTarget.src = placeholder }} />
          </button>
        ))}
      </div>
    </div>
  )
}
