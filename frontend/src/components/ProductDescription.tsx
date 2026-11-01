import type { EnrichedProduct } from '../data/productDetails'

interface ProductDescriptionProps {
  product: EnrichedProduct
}

export function ProductDescription({ product }: ProductDescriptionProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-3 text-lg font-bold text-text-primary">Описание</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{product.description}</p>
    </section>
  )
}
