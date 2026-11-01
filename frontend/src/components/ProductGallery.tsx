import { useState } from 'react'
import type { EnrichedProduct } from '../data/productDetails'

interface ProductGalleryProps {
  product: EnrichedProduct
}

export function ProductGallery({ product }: ProductGalleryProps) {
  const [active, setActive] = useState(0)
  const current = product.gallery[active] ?? product.gallery[0]

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="relative flex-1">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <img
            src={current}
            alt={product.name}
            className="aspect-square w-full object-contain"
          />
        </div>
      </div>

      <div className="flex flex-row gap-2 sm:flex-col">
        {product.gallery.map((image, index) => (
          <button
            key={`${product.slug}-thumb-${index}`}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Показать изображение ${index + 1} из ${product.gallery.length}`}
            className={[
              'h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-surface p-1 sm:h-20 sm:w-20',
              index === active
                ? 'border-primary'
                : 'border-border hover:border-border-hover',
            ].join(' ')}
          >
            <img src={image} alt="" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  )
}
