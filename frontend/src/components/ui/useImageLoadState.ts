import { useCallback, useState } from 'react'

export type ImageLoadState = 'loading' | 'loaded' | 'error'

/**
 * Tracks whether an `<img>` has actually painted.
 *
 * A cached picture can already be `complete` before React attaches `onLoad`, so
 * the ref callback checks that case as well: a cache hit must not flash a
 * placeholder. The state belongs to one picture, so render the image with a `key`
 * derived from its `src` when the same spot can show a different picture.
 */
export function useImageLoadState() {
  const [state, setState] = useState<ImageLoadState>('loading')
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (!node || !node.complete) return
    setState(node.naturalWidth > 0 ? 'loaded' : 'error')
  }, [])
  return {
    state,
    imgRef,
    onLoad: () => setState('loaded'),
    onError: () => setState('error'),
  }
}
