import { describe, expect, it } from 'vitest'
import type { SavedBuildOut } from '../api/generated/model'
import {
  buildCartRequest, resolveSavedBuildIdentity, sameConfiguration, savedBuildItems,
  type BuildSelectionItem,
} from './builderCartRequest'
import type { BuilderCategory } from '../stores/builderStore'

const SLOTS: BuilderCategory[] = ['cpu', 'mobo', 'gpu', 'ram', 'storage', 'psu', 'case', 'cooling']

const items = (offset = 0): BuildSelectionItem[] =>
  SLOTS.map((slot, index) => ({ slot, product_id: index + 1 + offset }))

const savedBuild = (overrides: Partial<SavedBuildOut> = {}): SavedBuildOut => ({
  id: 42, user_id: 7, name: 'Gaming PC 2026', description: '', image_url: null, version: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  items: items().map(item => ({
    slot: item.slot, product_id: item.product_id, product_name: `Part ${item.product_id}`,
    product_slug: `part-${item.product_id}`, price: '100.00',
  })),
  ...overrides,
})

describe('sameConfiguration', () => {
  it('requires the same eight parts in the same slots', () => {
    expect(sameConfiguration(items(), items())).toBe(true)
    expect(sameConfiguration(items(), [...items().slice(1), items()[0]])).toBe(true)
    expect(sameConfiguration(items(), items(1))).toBe(false)
  })

  it('refuses incomplete, duplicated or unknown slots', () => {
    expect(sameConfiguration(items(), items().slice(0, 7))).toBe(false)
    expect(sameConfiguration(items(), [...items().slice(0, 7), items()[0]])).toBe(false)
    expect(sameConfiguration(items(), [...items().slice(0, 7), { slot: 'monitor', product_id: 9 } as unknown as BuildSelectionItem])).toBe(false)
  })
})

describe('resolveSavedBuildIdentity', () => {
  it('has nothing to preserve when no saved build is open', () => {
    expect(resolveSavedBuildIdentity({ editingBuildId: null, queried: savedBuild(), saved: null, missing: false }))
      .toEqual({ state: 'none' })
  })

  it('uses the newest known version of the opened build', () => {
    const stale = savedBuild({ updated_at: '2026-01-01T00:00:00Z' })
    const fresh = savedBuild({ updated_at: '2026-01-02T00:00:00Z', version: 2 })
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: stale, saved: fresh, missing: false }))
      .toEqual({ state: 'build', build: fresh })
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: undefined, saved: fresh, missing: false }))
      .toEqual({ state: 'build', build: fresh })
  })

  it('ignores a build that is not the opened one', () => {
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: savedBuild({ id: 41 }), saved: savedBuild({ id: 43 }), missing: false }))
      .toEqual({ state: 'unresolved' })
  })

  it('reports an unresolved identity, but treats a deleted build as absent', () => {
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: undefined, saved: null, missing: false }))
      .toEqual({ state: 'unresolved' })
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: undefined, saved: null, missing: true }))
      .toEqual({ state: 'none' })
  })

  it('lets a confirmed deletion win over data the query still caches', () => {
    // TanStack Query keeps the previous successful `data` after a failed refetch.
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: savedBuild(), saved: null, missing: true }))
      .toEqual({ state: 'none' })
  })

  it('lets a confirmed deletion win over the last successful save', () => {
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: undefined, saved: savedBuild(), missing: true }))
      .toEqual({ state: 'none' })
  })

  it('lets a confirmed deletion win over both cached sources', () => {
    const stale = savedBuild({ updated_at: '2026-01-02T00:00:00Z', version: 2 })
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: savedBuild(), saved: stale, missing: true }))
      .toEqual({ state: 'none' })
  })

  it('does not reuse a cached row of another build, even next to a deletion', () => {
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: savedBuild({ id: 41 }), saved: savedBuild({ id: 43 }), missing: false }))
      .toEqual({ state: 'unresolved' })
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: savedBuild({ id: 41 }), saved: null, missing: true }))
      .toEqual({ state: 'none' })
  })

  it('keeps a cached row when the request failed for a reason other than deletion', () => {
    const cached = savedBuild()
    expect(resolveSavedBuildIdentity({ editingBuildId: 42, queried: cached, saved: null, missing: false }))
      .toEqual({ state: 'build', build: cached })
  })
})

describe('buildCartRequest', () => {
  const identity = resolveSavedBuildIdentity({ editingBuildId: 42, queried: savedBuild(), saved: null, missing: false })

  it('submits the saved build with the verified selections when they match', () => {
    expect(buildCartRequest(items(), identity)).toEqual({
      saved_build_id: 42, expected_items: items(), quantity: 1,
    })
  })

  it('submits the configuration directly when it differs from the saved build', () => {
    expect(buildCartRequest(items(1), identity)).toEqual({ items: items(1), quantity: 1 })
  })

  it('submits the configuration directly when nothing was saved', () => {
    expect(buildCartRequest(items(), { state: 'none' })).toEqual({ items: items(), quantity: 1 })
  })

  it('submits nothing while the saved identity is unresolved', () => {
    expect(buildCartRequest(items(), { state: 'unresolved' })).toBeNull()
  })

  it('never matches a saved build that is incomplete', () => {
    const partial = savedBuild()
    partial.items = partial.items?.slice(0, 7)
    expect(buildCartRequest(items(), { state: 'build', build: partial })).toEqual({ items: items(), quantity: 1 })
    expect(savedBuildItems(partial)).toHaveLength(7)
  })

  it('submits the verified configuration directly after a confirmed deletion', () => {
    // Both cached sources still identify the build; the server proved it is gone.
    const deleted = resolveSavedBuildIdentity({
      editingBuildId: 42,
      queried: savedBuild(),
      saved: savedBuild({ updated_at: '2026-01-02T00:00:00Z' }),
      missing: true,
    })
    expect(deleted).toEqual({ state: 'none' })
    const request = buildCartRequest(items(), deleted)
    expect(request).toEqual({ items: items(), quantity: 1 })
    // Neither the deleted id nor an expectation for it may be submitted.
    expect(request).not.toHaveProperty('saved_build_id')
    expect(request).not.toHaveProperty('expected_items')
  })
})
