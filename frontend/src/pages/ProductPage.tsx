import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Header } from '../components/Header'
import { BackButton } from '../components/BackButton'
import { Footer } from '../components/Footer'
import { ProductGallery } from '../components/ProductGallery'
import { ProductInfo } from '../components/ProductInfo'
import { ProductDescription } from '../components/ProductDescription'
import { ProductSpecs } from '../components/ProductSpecs'
import { ProductReviews, type ReviewSort } from '../components/ProductReviews'
import { useAccountStore, selectActiveAccount } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { useServerCart } from '../api/useServerCart'
import { productFromDetail } from '../api/catalogAdapter'
import type { EnrichedProduct, Review } from '../data/productDetails'
import { ReviewOut, type ReviewOut as ReviewResponse } from '../api/generated/model'
import { z } from 'zod'
import { copyToClipboard } from '../utils/copyToClipboard'
import {
  useGetProductApiV1ProductsSlugGet, getProductReviewsApiV1ProductsProductIdReviewsGet,
  getMyReviewApiV1ProductsProductIdReviewsMyGet, isFavoritedApiV1FavoritesProductIdIsFavoritedGet,
  addFavoriteApiV1FavoritesProductIdPost, removeFavoriteApiV1FavoritesProductIdDelete,
  createReviewApiV1ProductsProductIdReviewsPost, updateReviewApiV1ProductsProductIdReviewsPatch,
  deleteReviewApiV1ProductsProductIdReviewsDelete,
} from '../api/generated/client'

const asReview = (item: ReviewResponse): Review => ({
  id: item.id, author: item.reviewer_name, authorId: String(item.user_id),
  date: item.created_at, rating: item.rating, text: item.body,
})

export function ProductPage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const product = useGetProductApiV1ProductsSlugGet(slug, { query: { enabled: !!slug, retry: false } })
  if (product.isLoading) return <div className="min-h-screen bg-surface-2"><Header /><main className="pt-24 text-center" role="status">{t('common.loading')}</main></div>
  if (!product.data) return <div className="min-h-screen bg-surface-2"><Header /><main className="pt-24 text-center" role="alert">{product.isError ? t('common.load_error') : t('product.not_found')}</main><Footer /></div>
  return <ProductContent key={slug} product={productFromDetail(product.data)} />
}

function ProductContent({ product }: { product: EnrichedProduct }) {
  const { t } = useTranslation()
  const account = useAccountStore(selectActiveAccount)
  const openAuth = useUIStore(state => state.openAuthModal)
  const client = useQueryClient()
  const navigate = useNavigate()
  const cart = useServerCart()
  const [quantity, setQuantity] = useState(1)
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [shareCopied, setShareCopied] = useState(false)
  const [actionError, setActionError] = useState(false)
  const reviewsQuery = useQuery({ queryKey: ['product-reviews', product.id], queryFn: async ({ signal }) => {
    const first = await getProductReviewsApiV1ProductsProductIdReviewsGet(product.id, { page: 1, page_size: 50 }, { signal })
    const items = [...first.items]
    for (let page = 2; page <= first.total_pages; page += 1) {
      const next = await getProductReviewsApiV1ProductsProductIdReviewsGet(product.id, { page, page_size: 50 }, { signal })
      items.push(...next.items)
    }
    return { ...first, items }
  } })
  const ownQuery = useQuery({ queryKey: ['my-review', product.id], enabled: !!account, retry: false,
    queryFn: async ({ signal }) => ReviewOut.nullable().parse(await getMyReviewApiV1ProductsProductIdReviewsMyGet(product.id, { signal })) })
  const favorite = useQuery({ queryKey: ['favorite', product.id], enabled: !!account, retry: false,
    queryFn: async ({ signal }) => z.object({ is_favorited: z.boolean() }).parse(await isFavoritedApiV1FavoritesProductIdIsFavoritedGet(product.id, { signal })) })
  const refresh = () => client.invalidateQueries()
  const reviewMutation = useMutation({ mutationFn: (review: { rating: number; text: string }) => ownQuery.data
    ? updateReviewApiV1ProductsProductIdReviewsPatch(product.id, { rating: review.rating, body: review.text })
    : createReviewApiV1ProductsProductIdReviewsPost(product.id, { rating: review.rating, body: review.text }), onSuccess: refresh })
  const deleteReview = useMutation({ mutationFn: () => deleteReviewApiV1ProductsProductIdReviewsDelete(product.id), onSuccess: refresh })
  const isFavorite = favorite.data?.is_favorited === true
  const favoriteMutation = useMutation({ mutationFn: async () => {
    if (isFavorite) await removeFavoriteApiV1FavoritesProductIdDelete(product.id)
    else await addFavoriteApiV1FavoritesProductIdPost(product.id)
  }, onSuccess: refresh })
  const reviews = (reviewsQuery.data?.items ?? []).map(asReview)
  const current = { ...product, rating: reviewsQuery.data?.average_rating ?? product.rating, reviewCount: reviewsQuery.data?.total ?? product.reviewCount }
  const requireAccount = () => { if (account) return true; openAuth('login'); return false }
  const buy = async (count: number) => {
    if (!requireAccount()) return
    try { await cart.add.mutateAsync({ productId: product.id, quantity: count }); navigate('/cart') }
    catch { setActionError(true) }
  }
  const share = async () => {
    if (await copyToClipboard(`${window.location.origin}/products/${product.slug}`)) {
      setShareCopied(true); window.setTimeout(() => setShareCopied(false), 1500)
    }
  }

  return <div className="min-h-screen bg-surface-2">
    <Header />
    <main className="mx-auto max-w-[1320px] px-4 pb-8 pt-24">
      <BackButton className="mb-5" />
      {(actionError || cart.add.isError || favorite.isError || ownQuery.isError || favoriteMutation.isError || deleteReview.isError || reviewsQuery.isError) && <p role="alert" className="text-sm text-red-500">{t('common.load_error')}</p>}
      <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 lg:pr-4"><ProductGallery product={current} /></div>
        <ProductInfo product={current} quantity={quantity} isFavorite={isFavorite} favoriteDisabled={!!account && (!favorite.isSuccess || favoriteMutation.isPending)} onQuantityChange={setQuantity}
          onAddToCart={count => cart.addProduct(product.id, count)} onBuyNow={buy}
          onToggleFavorite={() => { if (requireAccount()) favoriteMutation.mutate() }} onShare={share} />
      </div>
      <div className="mt-6"><ProductDescription product={current} /></div>
      <div className="mt-6"><ProductSpecs product={current} /></div>
      <div className="mb-8 mt-6"><ProductReviews reviews={reviews} rating={current.rating} reviewCount={current.reviewCount}
        sort={sort} onSortChange={setSort} ownReview={ownQuery.data ? asReview(ownQuery.data) : null} accountName={account?.displayName} reviewDisabled={!!account && (!ownQuery.isSuccess || reviewMutation.isPending)}
        onDeleteReview={() => deleteReview.mutate()}
        onAddReview={async review => { if (!requireAccount()) throw new Error('Authentication required'); await reviewMutation.mutateAsync(review) }} /></div>
    </main>
    <Footer />
    {shareCopied && <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-text-primary px-4 py-2 text-sm font-medium text-surface shadow-lg">{t('product.link_copied')}</div>}
  </div>
}
