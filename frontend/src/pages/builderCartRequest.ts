import type { SavedBuildOut } from '../api/generated/model'
import { BUILDER_CATEGORIES, type BuilderCategory } from '../stores/builderStore'

/** One component selection of a configuration, the payload the server checks. */
export interface BuildSelectionItem {
  slot: BuilderCategory
  product_id: number
}

/**
 * Which saved build the current configuration belongs to.
 *
 * `none` means there is nothing to preserve (no saved build is open, or the
 * opened one no longer exists). `unresolved` means a saved build is known but its
 * data cannot be read yet: the caller must say so instead of submitting the
 * configuration as if it had never been saved.
 */
export type SavedBuildIdentity =
  | { state: 'none' }
  | { state: 'unresolved' }
  | { state: 'build'; build: SavedBuildOut }

/** Cart submission body: the saved identity, or the configuration itself. */
export type BuildCartRequest =
  | { saved_build_id: number; expected_items: BuildSelectionItem[]; quantity: number }
  | { items: BuildSelectionItem[]; quantity: number }

function isBuilderSlot(slot: string): slot is BuilderCategory {
  return (BUILDER_CATEGORIES as readonly string[]).includes(slot)
}

/** The eight unique slots of a configuration, or null when it is not complete. */
function configuration(
  items: readonly { slot: string; product_id: number }[],
): Map<string, number> | null {
  if (items.length !== BUILDER_CATEGORIES.length) return null
  const selections = new Map<string, number>()
  for (const item of items) {
    if (!isBuilderSlot(item.slot) || selections.has(item.slot)) return null
    selections.set(item.slot, item.product_id)
  }
  return selections
}

/** Whether two component lists describe exactly the same eight-part build. */
export function sameConfiguration(
  left: readonly { slot: string; product_id: number }[],
  right: readonly { slot: string; product_id: number }[],
): boolean {
  const a = configuration(left)
  const b = configuration(right)
  if (!a || !b) return false
  return BUILDER_CATEGORIES.every((slot) => a.get(slot) === b.get(slot))
}

/** The saved build's own selections in the payload shape. */
export function savedBuildItems(build: SavedBuildOut): BuildSelectionItem[] {
  return (build.items ?? []).flatMap((item) =>
    isBuilderSlot(item.slot)
      ? [{ slot: item.slot, product_id: item.product_id }]
      : [],
  )
}

export interface SavedBuildSources {
  /** Build opened in the configurator, if any. */
  editingBuildId: number | null
  /** Data the saved-build query holds, which may still be an older version. */
  queried: SavedBuildOut | undefined
  /** Saved build returned by the last successful save in this session. */
  saved: SavedBuildOut | null
  /** The saved-build query answered 404, so the build is gone. */
  missing: boolean
}

/**
 * The saved build the current configuration may belong to.
 *
 * A save answers with the authoritative row while the following refetch can still
 * return the previous version, so the newest known version of this very build is
 * used. A saved build that is known but unreadable is reported as unresolved
 * rather than silently downgraded to an unnamed configuration.
 */
export function resolveSavedBuildIdentity({
  editingBuildId,
  queried,
  saved,
  missing,
}: SavedBuildSources): SavedBuildIdentity {
  if (editingBuildId === null) return { state: 'none' }
  const known = [queried, saved].filter(
    (build): build is SavedBuildOut => !!build && build.id === editingBuildId,
  )
  if (known.length > 0) {
    return {
      state: 'build',
      build: known.reduce((newest, build) =>
        build.updated_at > newest.updated_at ? build : newest,
      ),
    }
  }
  if (missing) return { state: 'none' }
  return { state: 'unresolved' }
}

/**
 * The cart request for the verified configuration.
 *
 * An exact match with the saved build is submitted as that saved build plus the
 * selections that were verified, so the server can store the saved name. Any other
 * configuration is submitted directly: the saved version is never bought instead.
 * `null` means the identity is unresolved and nothing may be submitted.
 */
export function buildCartRequest(
  items: BuildSelectionItem[],
  identity: SavedBuildIdentity,
): BuildCartRequest | null {
  if (identity.state === 'unresolved') return null
  if (
    identity.state === 'build' &&
    sameConfiguration(items, savedBuildItems(identity.build))
  ) {
    return {
      saved_build_id: identity.build.id,
      expected_items: items,
      quantity: 1,
    }
  }
  return { items, quantity: 1 }
}
