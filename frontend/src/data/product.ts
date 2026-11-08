export interface Product {
  id: number
  name: string
  category: string
  type: string
  color?: string
  rating: number
  reviewCount: number
  addedAt: string
  onSale?: boolean
  manufacturer: string
  specs: string[]
  shortSpecs?: string[]
  graphicsChipBrand?: 'AMD' | 'NVIDIA'
  price: number
  image: string
  slug: string
}
