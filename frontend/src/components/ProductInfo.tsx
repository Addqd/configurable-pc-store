import { useState } from 'react'
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
  const { article } = product

  const handleCopy = async () => {
    const ok = await copyToClipboard(article)
    setCopied(ok)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <article className="flex flex-col">
      <p className="mb-2 text-sm font-medium text-primary">{product.category}</p>

      <h1 className="text-xl font-bold leading-tight text-text-primary sm:text-2xl">
        {product.name}
      </h1>

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-primary">
        {product.specs.join(' • ')}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <StarRating rating={product.rating} count={product.reviewCount} aria-label={`Оценка ${product.rating}`} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-b border-border pb-4">
        <span className="text-sm text-text-secondary">Артикул</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-primary transition-colors hover:text-primary"
          aria-label={`Копировать артикул ${article}`}
        >
          {article}
          {copied ? (
            <span className="text-xs text-emerald-500">Скопировано</span>
          ) : (
            <FiCopy className="h-4 w-4 text-text-muted" />
          )}
        </button>
      </div>

      <div className="mt-5">
        <p className="text-sm text-text-secondary">Цена</p>
        <p className="mt-1 text-3xl font-bold text-primary">{formatPrice(product.price)}</p>
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-500">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          В наличии
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Доступно в {product.stock} магазинах
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="inline-flex h-12 items-center overflow-hidden rounded-xl border border-border bg-surface-2">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="flex h-full w-12 items-center justify-center text-lg font-medium text-text-primary transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Уменьшить количество: ${product.name}`}
          >
            −
          </button>
          <span
            className="flex h-full min-w-12 items-center justify-center bg-surface px-3 text-base font-semibold text-text-primary"
            aria-label={`Количество: ${quantity}`}
          >
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => onQuantityChange(quantity + 1)}
            className="flex h-full w-12 items-center justify-center text-lg font-medium text-text-primary transition-colors hover:bg-surface-3"
            aria-label={`Увеличить количество: ${product.name}`}
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={() => onAddToCart(quantity)}
          className="flex-1 items-center justify-center rounded-xl px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-hover bg-primary"
        >
          Добавить в корзину
        </button>
      </div>

      <button
        type="button"
        onClick={() => onBuyNow(quantity)}
        className="mt-3 flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 text-base font-semibold text-text-primary transition-colors hover:bg-surface-3"
      >
        Купить сейчас
      </button>

      <div className="mt-5 flex items-center justify-around border-t border-border pt-4">
        <button
          type="button"
          onClick={onToggleFavorite}
          className={[
            'inline-flex items-center gap-2 text-sm font-medium transition-colors',
            isFavorite ? 'text-rose-500' : 'text-text-muted hover:text-text-primary',
          ].join(' ')}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
        >
          <FiHeart
            className={["h-5 w-5", isFavorite ? "fill-current" : ""].join(" ")}
          />
          {isFavorite ? 'Избранное' : 'В избранное'}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
          aria-label="Поделиться товаром"
        >
          <FiShare2 className="h-5 w-5" />
          Поделиться
        </button>
      </div>
    </article>
  )
}
