# TASK 002 — Shopping Cart (`/cart`)

## Goal
Full cart page with product items, build cards, order summary, demo checkout flow, and empty state.

## Acceptance Criteria
- [x] Product items render with specs, quantity controls, and removal
- [x] Build cards render with expandable component list ("N шт." per component)
- [x] Order summary with dynamic totals and free delivery threshold (50,000 ₽)
- [x] Demo checkout flow ("Оформить заказ" → "Спасибо!")
- [x] Empty cart state with "Перейти в каталог" + "Загрузить демо"
- [x] Store: persist (localStorage), demo order structure, clear on checkout
- [x] Theme: persist (localStorage), `<html>.dark` sync without flicker
- [x] Header: `Link` + `useNavigate`, "PC BUILDER" text, semantic tokens
- [x] Banners: explicit dark text colors for readability
- [x] Build/lint/test clean

## Modified Files
- `frontend/src/stores/cartStore.ts` — extended types, persist, Order type, seedDemoCart (local images)
- `frontend/src/stores/themeStore.ts` — added persist middleware
- `frontend/src/App.tsx` — added initial dark theme sync before first render
- `frontend/src/components/Header.tsx` — Link + useNavigate, "PC BUILDER" text
- `frontend/src/components/PromotionalBanner.tsx` — explicit dark text colors (#08090C, #475569)
- `frontend/src/components/EmptyCart.tsx` — FiShoppingCart, FiArrowRight import fix
- `frontend/src/components/BuildCartCard.tsx` — semantic tokens, "N шт." per component
- `frontend/src/components/ProductCartItem.tsx` — NEW
- `frontend/src/components/OrderSummary.tsx` — free delivery threshold
- `frontend/src/pages/CartPage.tsx` — two-column layout, demo checkout
- `frontend/src/stores/cartStore.test.ts` — updated for Order type (nextOrderId, order.items)

## Test Results
- 78/78 passed
- Build: ✓ 0 errors, 0 warnings
- Lint: clean

## Visual Verification
- Light theme: empty cart, demo cart (3 items), expanded/collapsed builds
- Dark theme: cart, profile toggle, checkout confirmation
- Checkout flow: "Оформить заказ" → confirmation with order # and total
- Mobile: responsive layouts verified
