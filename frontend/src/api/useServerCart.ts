import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import {
  addProductApiV1CartProductsPost, updateQuantityApiV1CartItemIdPatch,
  removeItemApiV1CartItemIdDelete, checkoutApiV1CartCheckoutPost,
  getGetCartApiV1CartGetQueryKey, getGetOrdersApiV1CartOrdersGetQueryKey,
  useGetCartApiV1CartGet,
} from './generated/client'

export function useServerCart() {
  const accountId = useAccountStore(state => state.activeAccountId)
  const openAuth = useUIStore(state => state.openAuthModal)
  const client = useQueryClient()
  const cart = useGetCartApiV1CartGet({ query: { enabled: !!accountId, retry: false } })
  const save = () => client.invalidateQueries({ queryKey: getGetCartApiV1CartGetQueryKey() })
  const add = useMutation({ mutationFn: ({ productId, quantity }: { productId: number; quantity: number }) =>
    addProductApiV1CartProductsPost({ product_id: productId, quantity }), onSuccess: save })
  const update = useMutation({ mutationFn: ({ id, quantity }: { id: number; quantity: number }) =>
    updateQuantityApiV1CartItemIdPatch(id, { quantity }), onSuccess: save })
  const remove = useMutation({ mutationFn: (id: number) => removeItemApiV1CartItemIdDelete(id), onSuccess: save })
  const checkout = useMutation({ mutationFn: () => checkoutApiV1CartCheckoutPost(), onSuccess: async () => {
    await Promise.all([save(), client.invalidateQueries({ queryKey: getGetOrdersApiV1CartOrdersGetQueryKey() })])
  } })
  const addProduct = (productId: number, quantity = 1) => {
    if (!accountId) { openAuth('login'); return }
    add.mutate({ productId, quantity })
  }
  return { accountId, cart, add, update, remove, checkout, addProduct }
}
