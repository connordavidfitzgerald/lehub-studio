import { ASPECTS } from '../config/constants'
import type { PosterState } from '../types'
import type { RenderAssets } from './env'
import { renderPoster } from './renderPoster'

export type ExportFormat = 'png' | 'jpg'

/**
 * Render the poster to a fresh offscreen canvas at full resolution (× `scale`)
 * and trigger a download.
 */
export async function exportPoster(
  state: PosterState,
  assets: RenderAssets,
  format: ExportFormat,
  scale = 1,
  quality = 0.92,
): Promise<void> {
  const aspect = ASPECTS.find((a) => a.id === state.aspect)!
  const w = Math.round(aspect.w * scale)
  const h = Math.round(aspect.h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  renderPoster(ctx, state, w, h, assets, scale)

  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, quality),
  )
  if (!blob) return

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `poster-${state.categoryId}-${aspect.id}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
