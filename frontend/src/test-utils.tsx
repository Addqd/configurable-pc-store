import type { ReactElement } from 'react'
import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

interface RenderWithClientOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Existing cache, so a test can assert which entries were invalidated. */
  client?: QueryClient
}

export function render(ui: ReactElement, options?: RenderWithClientOptions) {
  const { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }), ...rest } = options ?? {}
  return rtlRender(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    ...rest,
  })
}

/** Unseeded client with retries disabled, for tests that inspect the cache. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}
