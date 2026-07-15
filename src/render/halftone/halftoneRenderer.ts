import type { HalftoneParams } from '../../types'
import { HalftoneGL } from './gl'

let engine: HalftoneGL | null = null
function getEngine(): HalftoneGL {
  if (!engine) engine = new HalftoneGL()
  return engine
}

const deg2rad = (d: number) => (d * Math.PI) / 180

// Reused CPU canvas for cover-fitting the source into the target region.
const coverCanvas = document.createElement('canvas')
const coverCtx = coverCanvas.getContext('2d')!

// Cache processed results (keyed by a signature) so redraws that don't touch the
// image/params (e.g. typing text) don't re-run the shader. A small LRU keeps the
// live preview, the export, and several artboard thumbnails from thrashing one
// another when they render the same source at different sizes.
const CACHE_MAX = 16
const cache = new Map<string, HTMLCanvasElement>()
let imageIds = new WeakMap<HTMLImageElement, number>()
let nextId = 1
function idOf(img: HTMLImageElement): number {
  let id = imageIds.get(img)
  if (!id) {
    id = nextId++
    imageIds.set(img, id)
  }
  return id
}

/** Draw `img` into `coverCanvas` at w×h using object-fit: cover. */
function coverFit(img: HTMLImageElement, w: number, h: number) {
  coverCanvas.width = w
  coverCanvas.height = h
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  coverCtx.clearRect(0, 0, w, h)
  coverCtx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/**
 * Return a canvas of the halftoned image sized exactly to the target region.
 * `renderScale` keeps dot pitch consistent when exporting at higher resolution.
 */
export function getHalftone(
  img: HTMLImageElement,
  regionW: number,
  regionH: number,
  params: HalftoneParams,
  renderScale = 1,
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(regionW))
  const h = Math.max(1, Math.round(regionH))
  const key = JSON.stringify([idOf(img), w, h, params, renderScale])
  const hit = cache.get(key)
  if (hit) {
    // Refresh LRU recency.
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }

  coverFit(img, w, h)
  const out = getEngine().render(coverCanvas, w, h, {
    dotScale: params.dotScale * renderScale,
    contrast: params.contrast,
    brightness: params.brightness,
    saturation: params.saturation,
    shadows: params.shadows,
    highlights: params.highlights,
    sharpness: params.sharpness,
    angles: [
      deg2rad(params.angleC),
      deg2rad(params.angleM),
      deg2rad(params.angleY),
      deg2rad(params.angleK),
    ],
  })

  // Copy out of the shared GL canvas so the cached result survives the next render.
  const snapshot = document.createElement('canvas')
  snapshot.width = w
  snapshot.height = h
  snapshot.getContext('2d')!.drawImage(out, 0, 0)
  cache.set(key, snapshot)
  if (cache.size > CACHE_MAX) {
    // Evict the least-recently-used entry (first key in insertion order).
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return snapshot
}
