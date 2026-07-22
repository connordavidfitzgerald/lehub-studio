import {
  CATEGORY_SIZE_RATIO,
  LOGO_HEIGHT_RATIO,
  SECONDARY_SIZE_RATIO,
} from '../config/constants'
import { getPalette } from '../config/palettes'
import type { PosterState } from '../types'
import type { RenderAssets, RenderEnv } from './env'
import { grid } from './grid'
import { drawCenteredLayout } from './layouts/centeredLayout'
import { drawEditorialLayout } from './layouts/editorialLayout'
import { drawGenerativeLayout } from './layouts/generativeLayout'
import { drawSplitLayout } from './layouts/splitLayout'
import { drawPaper } from './paper'
import { getPaper } from '../config/papers'

/**
 * Assemble the environment a layout draws into. Exported so callers that only
 * need the geometry (the preview's drag hit-testing) can plan a layout with the
 * exact same inputs the renderer uses, without drawing anything.
 */
export function buildRenderEnv(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  w: number,
  h: number,
  assets: RenderAssets,
  renderScale = 1,
): RenderEnv {
  const shortEdge = Math.min(w, h)
  return {
    ctx,
    state,
    palette: getPalette(state.paletteId),
    g: grid(w, h),
    w,
    h,
    shortEdge,
    secondarySize: shortEdge * SECONDARY_SIZE_RATIO,
    categorySize: shortEdge * CATEGORY_SIZE_RATIO,
    logoHeight: shortEdge * LOGO_HEIGHT_RATIO,
    assets,
    renderScale,
  }
}

/**
 * Draw one complete poster into `ctx` at `w`×`h`. Pure given its inputs, so the
 * live preview and the export share exactly the same code path.
 */
export function renderPoster(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  w: number,
  h: number,
  assets: RenderAssets,
  renderScale = 1,
): void {
  const env = buildRenderEnv(ctx, state, w, h, assets, renderScale)

  // 1. Background
  ctx.save()
  ctx.fillStyle = env.palette.background
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  // 2. Layout content (halftone image + text + logo)
  if (state.layout === 'split') drawSplitLayout(env)
  else if (state.layout === 'editorial') drawEditorialLayout(env)
  else if (state.layout === 'generative') drawGenerativeLayout(env)
  else drawCenteredLayout(env)

  // 3. Paper textures overlaid on everything (printed-on-paper feel). Multiple
  //    papers layer in the order they were enabled, each with its own opacity.
  for (const id of state.paperIds) {
    const paper = getPaper(id)
    if (!paper.src) continue
    const opacity = state.paperOpacities[id] ?? paper.defaultOpacity
    drawPaper(ctx, assets.papers[id] ?? null, w, h, paper.blend, opacity)
  }
}
