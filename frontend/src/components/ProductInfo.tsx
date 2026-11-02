import { useEffect, useRef, useState } from 'react'
import type { EnrichedProduct } from '../data/productDetails'
import { formatPrice } from '../utils/formatPrice'
import { copyToClipboard } from '../utils/copyToClipboard'
import { StarRating } from './StarRating'
import { FiCopy, FiShare2, FiHeart } from 'react-icons/fi'

interface ProductInfoProps {
  product: EnrichedProduct
  quantity: number
  isFavorite: boolean
  onQuantityChange: (quantity: number) => void
  onAddToCart: (quantity: number) => void
  onBuyNow: (quantity: number) => void
  onToggleFavorite: () => void
  onShare: () => void
}

export function ProductInfo({
  product,
  quantity,
  isFavorite,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  onToggleFavorite,
  onShare,
}: ProductInfoProps) {
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copyTimeout.current !== null) clearTimeout(copyTimeout.current)
  }, [])

  const handleCopy = async () => {
    const ok = await copyToClipboard(product.article)
    if (!ok) return
    setCopied(true)
    if (copyTimeout.current !== null) clearTimeout(copyTimeout.current)
    copyTimeout.current = setTimeout(() => setCopied(false), 1200)
  }

  const specs = product.shortSpecs ?? product.specs

  return (
    <article className="flex min-w-0 flex-col">
      <p className="mb-2 text-sm font-medium text-primary">{product.category}</p>
      <h1 className="text-xl font-bold leading-tight text-text-primary sm:text-2xl">{product.name}</h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-primary">
        {specs.map((spec, index) => (
          <span key={`${spec}-${index}`}>
            {spec}
            {index < specs.length - 1 && <span className="mx-1.5 text-text-muted">•</span>}
          </span>
        ))}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <StarRating rating={product.rating} count={product.reviewCount} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-b border-border pb-4">
        <span className="text-sm text-text-secondary">Артикул</span>
        <button
          type="button"
          onClick={handleCopy}
          className="pc-hover-subtle inline-flex items-center gap-1.5 text-sm font-medium text-text-primary transition-colors hover:text-primary"
          aria-label={`Копировать артикул ${product.article}`}
        >
          {product.article}
          {copied ? <span className="text-xs text-emerald-500">Скопировано</span> : <FiCopy className="h-4 w-4 text-text-muted" />}
        </button>
      </div>

      <div className="mt-5">
        <p className="text-sm text-text-secondary">Цена</p>
        <p className="mt-1 text-3xl font-bold text-primary">{formatPrice(product.price)}</p>
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-500">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          В наличии (демо)
        </p>
        <p className="mt-1 text-xs text-text-muted">Наличие и цены приведены для демонстрации</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex h-12 shrink-0 items-center self-start overflow-hidden rounded-xl border border-border bg-surface-2">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="flex h-full w-12 items-center justify-center text-lg font-medium text-text-primary transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Уменьшить количество: ${product.name}`}
          >−</button>
          <span className="flex h-full min-w-12 items-center justify-center bg-surface px-3 text-base font-semibold text-text-primary" aria-label={`Количество: ${quantity}`}>
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => onQuantityChange(quantity + 1)}
            className="flex h-full w-12 items-center justify-center text-lg font-medium text-text-primary transition-colors hover:bg-surface-3"
            aria-label={`Увеличить количество: ${product.name}`}
          >+</button>
        </div>

        <button
          type="button"
          onClick={() => onAddToCart(quantity)}
          className="pc-hover-primary flex w-full flex-1 items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-hover dark:text-[#08090C]"
        >
          Добавить в корзину
        </button>
      </div>

      <button
        type="button"
        onClick={() => onBuyNow(quantity)}
        className="pc-hover-outline mt-3 flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 text-base font-semibold text-text-primary transition-colors hover:bg-surface-3"
      >
        Купить сейчас
      </button>

      <div className="mt-5 flex items-center justify-around border-t border-border pt-4">
        <button
          type="button"
          onClick={onToggleFavorite}
          className={`pc-hover-subtle inline-flex items-center gap-2 text-sm font-medium transition-colors ${isFavorite ? 'text-rose-500 hover:text-rose-400' : 'text-text-muted hover:text-text-primary'}`}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        >
          <FiHeart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          {isFavorite ? 'Избранное' : 'В избранное'}
        </button>
        <button type="button" onClick={onShare} className="pc-hover-subtle inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary" aria-label="Поделиться товаром">
          <FiShare2 className="h-5 w-5" /> Поделиться
        </button>
      </div>
    </article>
  )
}
