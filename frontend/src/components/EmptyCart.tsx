import { Link } from 'react-router'
import { FiShoppingCart, FiArrowRight } from 'react-icons/fi'

export function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FiShoppingCart className="w-20 h-20 text-text-muted mb-4" />
      <h2 className="text-xl font-semibold text-text-primary mb-2">Корзина пуста</h2>
      <p className="text-sm text-text-muted mb-6 max-w-sm">
        Добавьте товары из каталога, чтобы оформить заказ
      </p>
      <Link
        to="/catalog"
        className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
      >
        Перейти в каталог
        <FiArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
