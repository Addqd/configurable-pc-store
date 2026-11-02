import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router'
import { Header } from '../components/Header'
import { ProductGallery } from '../components/ProductGallery'
import { ProductInfo } from '../components/ProductInfo'
import { ProductDescription } from '../components/ProductDescription'
import { ProductSpecs } from '../components/ProductSpecs'
import { ProductReviews, type ReviewSort } from '../components/ProductReviews'
import { useCartStore, type OrderItem } from '../stores/cartStore'
import { getProductDetail } from '../data/productDetails'
import { copyToClipboard } from '../utils/copyToClipboard'
import { FiArrowLeft } from 'react-icons/fi'

export function ProductPage() {
  const { slug } = useParams()
  const product = useMemo(() => (slug ? getProductDetail(slug) : null), [slug])

  const addItem = useCartStore((s) => s.addItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const favorites = useCartStore((s) => s.favorites)
  const toggleFavorite = useCartStore((s) => s.toggleFavorite)

  const [quantity, setQuantity] = useState(1)
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [localReviews, setLocalReviews] = useState<NonNullable<typeof product>['reviews'] | null>(null)
  const [buySuccess, setBuySuccess] = useState<number | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    setQuantity(1)
    setLocalReviews(product ? product.reviews.slice() : null)
    setBuySuccess(null)
    setShareCopied(false)
  }, [slug])
  /* eslint-enable react-hooks/exhaustive-deps */

  if (!product) {
    return (
      <div className="min-h-screen bg-surface-2">
        <Header />
        <main className="mx-auto max-w-[1320px] px-4 py-20 text-center">
          <div className="rounded-2xl border border-border bg-surface p-12">
            <p className="mb-2 text-sm font-medium text-primary">Товар не найден</p>
            <h1 className="mb-4 text-2xl font-bold text-text-primary">
              {slug ? `Товар «${slug}» не найден` : 'Товар не найден'}
            </h1>
            <p className="mb-6 text-text-secondary">
              Похоже, такого товара нет в каталоге или он был снят с продажи.
            </p>
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <FiArrowLeft className="h-4 w-4" />
              Перейти в каталог
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const isFavorite = favorites.includes(product.id)
  const total = product.price * quantity

  const handleQuantityChange = (next: number) => {
    setQuantity(Math.max(1, next))
  }

  const handleAddToCart = () => {
    const existing = useCartStore.getState().items.find(
      (i) => i.id === product.id && !('components' in i),
    )
    if (existing) {
      // Item already in cart: add requested quantity on top
      updateQuantity(product.id, existing.quantity + quantity)
    } else {
      // New item: add with requested quantity
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        specs: product.specs,
        category: product.category,
      })
      if (quantity > 1) {
        updateQuantity(product.id, quantity)
      }
    }
  }

  const handleBuyNow = () => {
    // Create a snapshot order for this product only, preserving other cart items
    const orderItems: OrderItem[] = [{
      id: product.id,
      name: product.name,
      price: product.price,
      quantity,
      total: product.price * quantity,
      timestamp: Date.now(),
    }]
    const total = product.price * quantity
    setBuySuccess(product.id)
    // Record in orders via the store
    const orders = useCartStore.getState().orders
    const nextId = useCartStore.getState().nextOrderId
    useCartStore.setState({
      orders: [...orders, { id: nextId, items: orderItems, total, itemCount: quantity, timestamp: Date.now() }],
      nextOrderId: nextId + 1,
    })
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/products/${product.slug}`
    const ok = await copyToClipboard(url)
    setShareCopied(ok)
    window.setTimeout(() => setShareCopied(false), 1500)
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />

      <main className="mx-auto max-w-[1320px] px-4 py-6">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 mb-5 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <FiArrowLeft className="h-4 w-4" />
          В каталог
        </Link>

        {/* Top section */}
        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="lg:pr-4">
            <ProductGallery product={product} />
          </div>
          <div>
            <ProductInfo
              product={product}
              quantity={quantity}
              isFavorite={isFavorite}
              onQuantityChange={handleQuantityChange}
              onAddToCart={handleAddToCart}
              onBuyNow={handleBuyNow}
              onToggleFavorite={() => {
                toggleFavorite(product.id)
              }}
              onShare={handleShare}
            />
          </div>
        </div>

        {buySuccess === product.id && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-text-primary">Заказ оформлен — спасибо!</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  «{product.name}» × {quantity} — {total.toLocaleString('ru-RU')} ₽
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Товар добавлен в корзину. Без оплаты и оформления — это демо-покупка.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link
                    to="/cart"
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
                  >
                    Перейти в корзину
                  </Link>
                  <button
                    type="button"
                    onClick={() => setBuySuccess(null)}
                    className="text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
                  >
                    Продолжить покупки
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Description */}
        <div className="mt-6">
          <ProductDescription product={product} />
        </div>

        {/* Specs */}
        <div className="mt-6">
          <ProductSpecs product={product} />
        </div>

        {/* Reviews */}
        <div className="mb-16 mt-6">
          <ProductReviews
            reviews={localReviews ?? product.reviews}
            rating={product.rating}
            reviewCount={product.reviewCount}
            sort={sort}
            onSortChange={setSort}
            onAddReview={(review) => {
              const withId = { ...review, id: Date.now(), date: new Date().toISOString().slice(0, 10), verified: false }
              setLocalReviews((prev) => (prev ? [withId, ...prev] : [withId]))
            }}
          />
        </div>
      </main>

      {shareCopied && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-text-primary px-4 py-2 text-sm font-medium text-surface shadow-lg">
          Ссылка скопирована
        </div>
      )}
    </div>
  )
}
