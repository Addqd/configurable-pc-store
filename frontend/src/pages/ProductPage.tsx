import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { Header } from '../components/Header'
import { BackButton } from '../components/BackButton'
import { Footer } from '../components/Footer'
import { ProductGallery } from '../components/ProductGallery'
import { ProductInfo } from '../components/ProductInfo'
import { ProductDescription } from '../components/ProductDescription'
import { ProductSpecs } from '../components/ProductSpecs'
import { ProductReviews, type ReviewSort } from '../components/ProductReviews'
import { useCartStore, type Order, type RegularCartItem } from '../stores/cartStore'
import { calculateRating, getProductDetail, type EnrichedProduct, type Review } from '../data/productDetails'
import { readProductReviews, writeProductReviews } from '../data/reviewStorage'
import { copyToClipboard } from '../utils/copyToClipboard'
import { formatPrice } from '../utils/formatPrice'

export function ProductPage() {
  const { slug } = useParams()
  const product = slug ? getProductDetail(slug) : null
  // Route param changes must reset quantity, gallery selection, review modal and toasts.
  return <ProductDetailContent key={slug ?? 'missing'} product={product} />
}

function ProductDetailContent({ product }: { product: EnrichedProduct | null }) {
  const addItem = useCartStore((state) => state.addItem)
  const purchaseProduct = useCartStore((state) => state.purchaseProduct)
  const favorites = useCartStore((state) => state.favorites)
  const toggleFavorite = useCartStore((state) => state.toggleFavorite)

  const [quantity, setQuantity] = useState(1)
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [userReviews, setUserReviews] = useState<Review[]>(() => product ? readProductReviews(product.slug) : [])
  const [buySuccess, setBuySuccess] = useState<Order | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  if (!product) {
    return (
      <div className="min-h-screen bg-surface-2">
        <Header />
        <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-24 text-center">
          <div className="rounded-2xl border border-border bg-surface p-8 sm:p-12">
            <p className="mb-2 text-sm font-medium text-primary">Товар не найден</p>
            <h1 className="mb-4 text-2xl font-bold text-text-primary">Товар не найден</h1>
            <p className="mb-6 text-text-secondary">Похоже, такого товара нет в каталоге.</p>
            <BackButton />
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  const cartItem: Omit<RegularCartItem, 'quantity'> = {
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    specs: [...product.specs],
    category: product.category,
  }

  const reviews = [...userReviews, ...product.reviews]
  const productWithCurrentRating: EnrichedProduct = {
    ...product,
    reviews,
    rating: calculateRating(reviews),
    reviewCount: reviews.length,
  }

  const handleAddToCart = (count: number) => {
    addItem(cartItem, count)
  }

  const handleBuyNow = (count: number) => {
    const order = purchaseProduct(cartItem, count)
    if (order) setBuySuccess(order)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/products/${product.slug}`
    const ok = await copyToClipboard(url)
    if (ok) {
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1500)
    }
  }

  const addReview = (review: { author: string; rating: number; text: string }) => {
    const nextReview: Review = {
      ...review,
      id: Math.max(Date.now(), ...userReviews.map((item) => item.id)) + 1,
      date: new Date().toISOString().slice(0, 10),
    }
    const next = [nextReview, ...userReviews]
    setUserReviews(next)
    writeProductReviews(product.slug, next)
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />
      <main className="mx-auto max-w-[1320px] px-4 pb-8 pt-24">
        <BackButton className="mb-5" />

        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <div className="min-w-0 lg:pr-4"><ProductGallery product={productWithCurrentRating} /></div>
          <ProductInfo
            product={productWithCurrentRating}
            quantity={quantity}
            isFavorite={favorites.includes(product.id)}
            onQuantityChange={(next) => setQuantity(Math.max(1, next))}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onToggleFavorite={() => toggleFavorite(product.id)}
            onShare={handleShare}
          />
        </div>

        {buySuccess && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5" role="status">
            <h2 className="text-lg font-bold text-text-primary">Заказ оформлен — спасибо!</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Демо-заказ №{buySuccess.id}: «{buySuccess.items[0].name}» × {buySuccess.items[0].quantity} — {formatPrice(buySuccess.total)}
            </p>
            <p className="mt-2 text-sm text-text-muted">Заказ сохранён в демонстрационной истории. Корзина не изменена; оплаты не было.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link to="/cart" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover dark:text-[#08090C]">Перейти в корзину</Link>
              <button type="button" onClick={() => setBuySuccess(null)} className="text-sm font-medium text-text-muted hover:text-text-primary">Продолжить покупки</button>
            </div>
          </div>
        )}

        <div className="mt-6"><ProductDescription product={productWithCurrentRating} /></div>
        <div className="mt-6"><ProductSpecs product={productWithCurrentRating} /></div>
        <div className="mb-8 mt-6">
          <ProductReviews
            reviews={reviews}
            rating={productWithCurrentRating.rating}
            reviewCount={productWithCurrentRating.reviewCount}
            sort={sort}
            onSortChange={setSort}
            onAddReview={addReview}
          />
        </div>
      </main>
      <Footer />
      {shareCopied && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-text-primary px-4 py-2 text-sm font-medium text-surface shadow-lg">Ссылка скопирована</div>
      )}
    </div>
  )
}
