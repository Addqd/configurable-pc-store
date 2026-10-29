import { useCartStore } from '../stores/cartStore'

export function CartPage() {
  const items = useCartStore((s) => s.items)
  const totalPrice = () => useCartStore((s) => s.totalPrice())

  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-[1320px] mx-auto py-8">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Корзина</h1>
        {items.length === 0 ? (
          <p className="text-text-secondary">Корзина пуста</p>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-surface border border-border rounded-lg">
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-md object-cover bg-surface-3" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">{item.name}</p>
                    <p className="text-sm text-text-secondary">Кол: {item.quantity}</p>
                  </div>
                  <p className="font-semibold text-text-primary">{new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-text-primary">Итого: {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(totalPrice())}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
