# TASK — Guest catalog failure + P1/P2/P3 fixes & regression verification

## Skills read (sequentially, before implementation)
- systematic-debugging, code-review-and-quality, security-best-practices
  (+ references `javascript-typescript-react-web-frontend-security.md`, `python-fastapi-web-server-security.md`),
  vitest, playwright-e2e (no checked-in Playwright suite in repo → browser evidence via pi-frontend-check),
  verification-before-completion, fastapi, pytest.
- Context7 `/tanstack/query`: `remove()` → `destroy()` "silently cancels any in-flight fetch" and does NOT notify
  observers; `cancelQueries`/`removeQueries` accept a `predicate` (used for private-key scoping).

## Preflight gate (approved commands only)
- [x] `cd frontend && npm run dev` → Vite 8.3.5 ready on http://localhost:5173 (no fallback port).
- [x] Backend: already-running `uv run poe dev` instance on 127.0.0.1:8000 (uvicorn `--reload`, PID 21848 + reload
      child 22004); `/health/db` → `{"status":"ok","database":"connected"}`. Reused instead of starting a second
      process on the occupied port (killing / port changes forbidden). Server still healthy at the end of the task.

## P1 — Root cause (confirmed by evidence, not hypothesis)
Reproduction (temporary Vitest probes, deleted after use):
1. Mechanism: observed in-flight query + `cancelQueries()` + `clear()` → state stays `pending` forever, cache empty,
   no re-render (`AFTER CLEAR pending fetches 1 cache 0`).
2. Full app, guest with stale csrf cookie, product request in flight when `/auth/refresh` answered 403:
   cache events `removed:/api/v1/products`, `removed:/api/v1/products/filters` … re-added, and the UI stayed on
   «Загрузка...» with `fetchStatus: 'fetching'` and no data — the visitor could never see products.
Cause: `clearSession()` ran `queryClient.cancelQueries()` + `queryClient.clear()` on every session transition
(anonymous restore, logout, login, password change, 401 refresh failure), tearing down public catalog queries.

- [x] Guest state: `refreshSession()` returns `null` when there is no CSRF/session cookie → no request, no
      session-expired cascade (`restore()` simply stays a guest).
- [x] Cache cleanup scoped to private endpoints/profiles only (`clearPrivateQueryCache`, `privateEndpoints.ts`).
- [x] Public requests are no longer invalidated by a session-version change (stale-session guard applies to
      session-scoped paths only); private requests keep the guard.
- [x] Preserved: refresh concurrency guard (`refreshPromise`), `waitForRefresh`, epoch/serializeAuth, CSRF on
      logout, protected backend endpoints untouched.
- [x] Red-green proof: reverting cache scoping failed 4 app-level tests; reverting the guest refresh behaviour
      failed the transport guest test. Both restored → green.

## P2.1 — Catalog independent of the filter API
- [x] `catalogParams(filters, query, page, options?)`; products load without filter metadata, active values are
      forwarded, not dropped. Localized `catalog.filter.load_error` + retry; grid stays visible.
- [x] Browser: patched `/products/filters` → 500 in a real page, clicked a catalog link → 8 prebuilt products +
      «Фильтры недоступны. Товары показаны без фильтров.» + «Повторить»; retry after restoring fetch removed it.
- [x] Test: filters 500 + products 200 → grid renders, `categories=gpu&sort=price_asc` still sent.

## P2.2 — Homepage states
- [x] `ProductSection` renders loading / error (with retry) / empty ("Пока нет товаров") / ready per section.
- [x] Per-section failures no longer hidden by a single global alert; successful sections stay visible.
- [x] Tests: loading vs empty vs error, partial failure + retry (`HomePage.test.tsx`).

## P2.3 — API error diagnostics
- [x] `ApiError.status` unchanged; added `method`, `path` (no query string), sanitized FastAPI `detail`
      (string or validation array), `name = 'ApiError'`.
- [x] Empty body, malformed JSON, non-JSON pages → status-only, raw body never copied; network failure →
      `ApiError(0)`; AbortError stays a cancellation; Zod validation untouched.
- [x] Tests: 401, 403, 404, 422, 500, network, invalid schema (existing), empty/malformed/non-JSON bodies,
      no query-string/credential leakage.

## P2.4 — Guest-session integration coverage
- [x] `App.guest.test.tsx`: anonymous startup without cookies (0 refresh calls), stale-cookie guest with an
      in-flight product request, expired token clearing only private cache, real session restore, logout during
      active public requests (public cache/data kept, private dropped, no CSRF header without cookie), account
      switch keeps public data and drops private data.
- [x] `accountStore.test.ts`: real private key `['/api/v1/cart']`; guest restore keeps public cache; rejected
      stale session drops only private cache.

## P3.1 — Search debounce
- [x] `useDebouncedValue` (250 ms) for suggestions **and** count; empty query → no requests; per-term query keys
      prevent outdated responses from replacing newer ones; Enter/navigation unchanged.
- [x] Tests: rapid typing → one request for the settled term; clearing → no request; slow older response ignored.
- [x] Browser: typing "rtx" shows suggestions + «Показать все (14)»; Enter → `/catalog?q=rtx` with 14 products.

## P3.2 — Cookie security configuration
- [x] `APP_ENV` (`development`|`production`) added; production without `COOKIE_SECURE=true` now fails settings
      validation; SameSite=None still requires secure cookies; local HTTP development keeps working.
- [x] README documents the development/HTTPS-production settings and cookie types (no secrets, `.env` untouched).
- [x] Backend tests for the three validation cases (run without a database).

## CatalogPage lint warning fix (root cause + fix)
- Причина: `useEffect(()=>{ setDraft(readFilters(searchParams)); setFiltersOpen(false) },[searchParams])`
  синхронно сбрасывал состояние в эффекте (`react-hooks` → `set-state-in-effect`, лишний рендер) и дублировал
  данные, которые выводятся из URL.
- Fix: `filtersOpen`/`draft` выводятся из `editing` (`null` = закрыт); смена URL обнуляет `editing` через
  документированный React-паттерн «adjust state when a prop changes» (сравнение `draftUrlKey` во время
  рендера) — без эффекта и без отключения правил. Правки в drawer'е, закрытие по навигации и Back/Forward
  сохранены; черновик не «воскресает» после Back+Forward (тест + браузер).

## Verification (actual results)
- [x] `npm run lint` → **0 предупреждений** (было `react(set-state-in-effect)` в `CatalogPage.tsx:43`).
- [x] `npm run test:run` → 31 файл, **188 тестов passed** (+2 теста синхронизации drawer ↔ URL: закрытие
      по навигации с рехидратацией и сохранение состояния при Back/Forward).
- [x] `npm run build` → `tsc -b` + vite build OK (bundle-size warning only, pre-existing).
- [x] Browser: apply фильтра → `?category=cpu`, 7 товаров; повторное открытие drawer'а восстанавливает
      чекбокс из URL; unsaved-правка + Back → drawer закрыт (49 товаров); Forward → URL восстановлен,
      drawer остаётся закрыт; console чист.
- [x] `uv run poe lint` → "All checks passed!"
- [x] `uv run poe format-check` → "49 files already formatted" (ruff cache write warnings only).
- [x] `uv run poe typecheck` → "Success: no issues found in 32 source files".
- [x] `uv run poe test` → **55 passed, 29 skipped** (после фикса переносимости); 29 skipped = DB-интеграционные тесты
      без `PC_BUILDER_TEST_DATABASE_URL`.
- [x] Исправлены 2 прежних падения `test_migration_and_null_snapshots.py`: шаблон `alembic/script.py.mako`
      лежит в checkout с CRLF (подтверждено `od -c`), mako рендерит его дословно, а ассерты ожидали `\n`.
      `_render_migration()` теперь нормализует переводы строк (`\r\n`/`\r` → `\n`), т.е. тест проверяет
      сгенерированный код, а не платформенный newline. Сам шаблон и `.gitattributes` не менялись (Git запрещён).
- [x] Browser (pi-frontend-check): guest home (1280) all sections render; guest catalog fresh context (51 products,
      clean console); stale-cookie guest catalog (products render, only the expected `/auth/refresh` 403);
      catalog at 375 px (2-column layout intact); product detail page for a guest; filter-outage scenario above.
- [x] Browser authenticated flows (credentials supplied by the owner: `testuser12345`):
      login from an anonymous catalog session (catalog kept, 51 products, profile shows testuser12345);
      `/account` loads private data (Покупок 1, Отзывов 1); hard reload restores the session through
      `/auth/refresh` + `/auth/me` while public requests run (catalog intact, clean console); **logout while a
      product request was in flight** (product requests delayed 4 s via a temporary `fetch` patch) → the in-flight
      page-2/`?q=rtx` response still landed (14 products, «Найдено 14 товаров»), private cache dropped, profile back to
      guest, cart badge cleared, no «Загрузка...» stuck state; `/account` after logout shows the login-required card
      (no private data leak); second login after logout repopulates private data; final state: guest, cookies empty,
      49 cards, no alerts, console clean.
- [ ] Not reproducible in the browser without changing configuration: access-token expiry during browsing
      (15-minute TTL) and switching between two different accounts (only one test account available).
      Both are covered by the automated app-level tests instead.

## Compliance
- No Git/GitHub operations. No `.env` reads/writes. No external TEMP/TMP use (all scratch files under
  `.agent/tmp/`). Only approved project scripts were executed; no dependency installs, no port changes,
  no process terminations.

## P2 — Catalog filter fallback (display names must not be sent as slugs)
- Root cause: with `/products/filters` failing, `catalogParams` forwarded drawer display names (`types=Видеокарты`,
  `manufacturers=ASUS`) into `ProductType.slug`/`Manufacturer.slug` filters → backend matched nothing → empty
  catalogue that looked like "Ничего не найдено".
- Fix (`api/catalogAdapter.ts`): `resolveCatalogQuery()` returns `{ params, unresolved }`. Each selected value is
  resolved via metadata → local category labels (`CATEGORY_SLUG_MAP`) → lowercase API-slug passthrough (deep links).
  Values that cannot be translated are **left out of the request** (never sent as slugs) and reported as
  `unresolved`, while the URL keeps the selection so Retry applies it again. `catalogParams` stays as a thin wrapper.
- UI (`pages/CatalogPage.tsx`): the filter alert now names the groups not applied —
  «Фильтры недоступны. Не применены: Тип.» (`catalog.filter.partial_error`, ru/en) instead of a generic message.
- Tests: `api/catalogAdapter.test.ts` (5) + CatalogPage fallback test (product request has `categories`/`colors`,
  no `types=`; alert names «Тип»). Red-green verified by mutation (`?? value` → 3 tests fail).

## P3 — Stale search suggestions
- Root cause: the dropdown rendered `suggestions.data` for the **settled** (debounced) term while the input already
  showed a newer term; only the count was zeroed → previous term's items stayed visible during the 250 ms debounce.
  (TanStack Query has no `placeholderData` here, so data is strictly per key — the staleness was UI-level.)
- Fix (`components/SearchDropdown.tsx`): `isSettling = trimmed !== debouncedQuery` → results are `[]`, count is
  `null` (link renders «Показать все» via `header.show_all_no_count`, ru/en), status shows «Загрузка...»; results
  and counts appear only after the term settles.
- Tests: 2 new tests (stale results/count hidden while debouncing; cleared+retyped query hides old items).
  Red-green verified by mutation (2 tests fail).

## Verification (this follow-up, from frontend/)
- [x] `npm run lint` → 0 warnings/errors
- [x] `npm run test:run` → 32 files / **196 tests passed** (было 188)
- [x] `npm run build` → OK
- [x] Browser: filters 500 + `?category=gpu&types=Видеокарты&colors=Чёрный` → 9 товаров, request
      `/api/v1/products?…&categories=gpu&colors=Чёрный…` **без** `types=`, баннер «Не применены: Тип» + «Повторить»;
      поиск: «rtx» → 5 подсказок + (14); ввод «ryzen» → сразу и через 60 мс старые RTX-подсказки скрыты,
      ссылка «Показать все» без числа, «Загрузка...»; через ~900 мс — подсказки ryzen + (9). Console чист.
