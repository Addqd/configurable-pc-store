import { catalogDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import placeholder from '../assets/placeholder.jpg'
import type { EnrichedProduct } from '../data/productDetails'
import { Skeleton, SkeletonText } from './ui/skeleton'
import { useImageLoadState } from './ui/useImageLoadState'

interface ProductGalleryProps {
  product: EnrichedProduct
}

/**
 * One gallery picture with its loading placeholder.
 *
 * The box is sized by the `<img>` exactly as before (`aspect-square` for the main
 * picture, the thumbnail box for the miniatures), and the placeholder covers it
 * absolutely, so nothing shifts when the picture paints. A failed request ends the
 * placeholder and falls back to the existing placeholder image.
 */
function GalleryImage({ url, alt, className }: {
  url: string
  alt: string
  className: string
}) {
  const { state, imgRef, onLoad, onError } = useImageLoadState()
  return <>
    {state === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
    <img
      ref={imgRef}
      src={url}
      alt={alt}
      className={className}
      onLoad={onLoad}
      onError={(event) => {
        onError()
        if (!event.currentTarget.src.endsWith(placeholder)) event.currentTarget.src = placeholder
      }}
    />
  </>
}

export function ProductGallery({ product }: ProductGalleryProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  // Server order is already sorted by sort_order; the first image is the cover.
  const images = product.gallery.length > 0 ? product.gallery : [{ url: placeholder }]
  const current = images[active] ?? images[0]

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        <GalleryImage
          key={current.url}
          url={current.url}
          alt={current.alt?.trim() || catalogDisplay(product.name)}
          className="aspect-square w-full object-contain"
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
            <span className="relative block h-full w-full">
              <ThumbnailImage key={image.url} url={image.url} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ThumbnailImage({ url }: { url: string }) {
  const { state, imgRef, onLoad, onError } = useImageLoadState()
  return <>
    {state === 'loading' && <SkeletonText className="absolute inset-0 rounded-none" />}
    <img
      ref={imgRef}
      src={url}
      alt=""
      className="h-full w-full object-contain"
      onLoad={onLoad}
      onError={(event) => {
        onError()
        if (!event.currentTarget.src.endsWith(placeholder)) event.currentTarget.src = placeholder
      }}
    />
  </>
}
