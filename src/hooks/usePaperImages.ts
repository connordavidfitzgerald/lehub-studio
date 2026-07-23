import { useEffect, useSyncExternalStore } from 'react'
import { PAPERS } from '../config/papers'

/**
 * Every paper is enabled by default, so all of them are needed for the very
 * first paint — there is nothing to defer. Instead each texture loads twice:
 * a few-KB preview that lands almost immediately, then the full-resolution
 * file, which replaces it in place. The canvas redraws on each arrival, so the
 * poster comes up textured and sharpens as the real files finish.
 *
 * The cache is module-level: three components ask for these textures, and they
 * should share one set of loads (and one set of decoded images) between them.
 */

type PaperMap = Record<string, HTMLImageElement | null>

let map: PaperMap = {}
const listeners = new Set<() => void>()

/** Ids whose full-resolution texture has landed — a late preview can't undo it. */
const fullLoaded = new Set<string>()

function publish(id: string, img: HTMLImageElement) {
  map = { ...map, [id]: img }
  for (const l of listeners) l()
}

function load(src: string, priority: 'high' | 'low'): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.fetchPriority = priority
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

let ready: Promise<void> | null = null

/** Kick off both tiers for every paper. Idempotent — the first caller wins. */
function startLoading(): Promise<void> {
  ready ??= (async () => {
    await Promise.all(
      PAPERS.filter((p) => p.src).map(async (p) => {
        // The preview is worth having only until the real file arrives, so it
        // goes out at high priority and is discarded if it loses the race.
        if (p.previewSrc) {
          void load(p.previewSrc, 'high').then((img) => {
            if (img && !fullLoaded.has(p.id)) publish(p.id, img)
          })
        }
        const full = await load(p.src!, 'low')
        if (full) {
          fullLoaded.add(p.id)
          publish(p.id, full)
        }
      }),
    )
  })()
  return ready
}

/**
 * Resolves once every full-resolution texture has loaded (or failed). Export
 * awaits this so a poster is never written out with a preview baked into it.
 */
export function papersReady(): Promise<void> {
  return startLoading()
}

/** The current textures, for callers outside the render tree (e.g. export). */
export function getPaperImages(): PaperMap {
  return map
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The paper textures loaded so far, keyed by paper id. */
export function usePaperImages(): PaperMap {
  useEffect(() => {
    void startLoading()
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => map,
    () => map,
  )
}
