import { GRID_COLUMNS, LOGO } from '../../config/constants'
import { fontString, HEADER_FONT } from '../../config/fonts'
import type { GenElementKey, GenSlot, PosterState } from '../../types'
import type { PlacedElement, Rect, RenderAssets, RenderEnv } from '../env'
import type { HAlign } from '../elements'
import {
  anchorX,
  anchorY,
  priorityOf,
  resolveOverlaps,
  type Placement,
} from './generativePlan'
import { buildRenderEnv } from '../renderPoster'
import { drawCenteredLayout } from './centeredLayout'
import { drawEditorialLayout } from './editorialLayout'
import { drawSplitLayout } from './splitLayout'

/**
 * Shared machinery for the three preset layouts (editorial, split, centered).
 *
 * Each keeps its own composition for everything left alone, but any element can
 * be dragged out of that flow and pinned to a cell of the canvas-wide 3×3 anchor
 * grid — the same grid, pins and drop behaviour as the generative layout. A
 * pinned element stops taking part in its layout's stack, so the rest closes up
 * behind it.
 *
 * Geometry is gathered by running the real draw with a collector attached, so
 * hit-testing and rendering can never drift apart.
 */

/** Layouts that support drag editing on top of their preset composition. */
export type PresetLayout = 'editorial' | 'split' | 'centered'

export const isPresetLayout = (l: string): l is PresetLayout =>
  l === 'editorial' || l === 'split' || l === 'centered'

/** A header narrower than this has nowhere left to put a headline. */
const MIN_HEADER_COLS = 2

/** Header span in whole grid columns, or null when the edge has never been dragged. */
export function clampHeaderCols(cols: number | null | undefined): number | null {
  if (cols == null) return null
  return Math.max(MIN_HEADER_COLS, Math.min(GRID_COLUMNS, Math.round(cols)))
}

/** The pin held by one element, or null when it still follows the layout's flow. */
export function slotOf(state: PosterState, key: GenElementKey): GenSlot | null {
  if (key === 'header') return state.presetHeaderSlot ?? null
  if (key === 'category') return state.presetCategorySlot ?? null
  if (key === 'logo') return state.presetLogoSlot ?? null
  if (key === 'image') return null
  return state.paragraphs[Number(key.slice(1))]?.presetSlot ?? null
}

/** The image half never shrinks past this fraction of the canvas, nor the text. */
export const MIN_SPLIT = 0.2
export const MAX_SPLIT = 0.8

/** The fraction of the canvas the split layout's image half takes. */
export function splitFraction(state: PosterState): number {
  const r = state.splitRatio
  if (r == null) return 0.5
  return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, r))
}

/**
 * The zones a pinned element can be anchored in. The split layout has two — the
 * text half and the image half — so an element can be dropped into the corners
 * of the image the same way it can in the generative layout. Editorial and
 * centered put their image full-bleed behind everything, so there is no separate
 * image zone to aim at and the whole canvas is one region.
 */
export interface PresetRegions {
  text: Rect
  image: Rect | null
}

/** The split layout's two halves — it always has both. */
export function splitRegions(
  state: PosterState,
  w: number,
  h: number,
): { text: Rect; image: Rect } {
  const imageH = h * splitFraction(state)
  return state.textHalf === 'top'
    ? { text: { x: 0, y: 0, w, h: h - imageH }, image: { x: 0, y: h - imageH, w, h: imageH } }
    : { text: { x: 0, y: imageH, w, h: h - imageH }, image: { x: 0, y: 0, w, h: imageH } }
}

export function presetRegions(state: PosterState, w: number, h: number): PresetRegions {
  if (state.layout !== 'split') return { text: { x: 0, y: 0, w, h }, image: null }
  return splitRegions(state, w, h)
}

/** The divider between the two halves, as a drag handle. */
export function splitEdge(state: PosterState, w: number, h: number): number | null {
  if (state.layout !== 'split') return null
  const { image } = splitRegions(state, w, h)
  return state.textHalf === 'top' ? image.y : image.y + image.h
}

/** The alignment a cell implies for whatever lands in it. */
export const alignForCell = (h: GenSlot['h']): HAlign =>
  h === 'left' ? 'left' : h === 'right' ? 'right' : 'center'

/** The logo's drawn size, needed to place and hit-test it like any other element. */
export function logoBox(env: RenderEnv): { w: number; h: number } {
  const img = env.assets.logo
  const h = env.logoHeight
  if (img && img.naturalWidth) return { w: (img.naturalWidth / img.naturalHeight) * h, h }
  env.ctx.font = fontString(HEADER_FONT, h)
  return { w: env.ctx.measureText(LOGO.fallbackText).width, h }
}

/** An element that has been pinned, ready to be drawn at its cell. */
export interface PinnedItem {
  key: GenElementKey
  box: { w: number; h: number }
  slot: GenSlot
  drawAt: (x: number, y: number, align: HAlign) => void
}

/**
 * Position every element, push apart anything that would overlap, then draw.
 *
 * The preset layouts stack flush by construction, but a pinned element has left
 * that flow and can land on top of something that stayed in it. Elements are
 * settled in priority order — the category label and logo are fixtures, pinned
 * elements beat the flow — and anything contested slides clear, down by
 * preference. Drawing happens only once everything has a final home, so what is
 * collected for hit-testing is exactly what is painted.
 */
export function composePreset(env: RenderEnv, placements: Placement[]): void {
  for (const p of resolveOverlaps(placements, env.h)) {
    p.drawAt(p.rect.x, p.rect.y, p.align)
    env.collect?.({ key: p.key, rect: p.rect, align: p.align, slot: p.slot })
  }
}

/** Build a {@link Placement} for one element, in flow or pinned. */
export function placement(
  key: GenElementKey,
  rect: Rect,
  align: HAlign,
  slot: GenSlot | null,
  drawAt: (x: number, y: number, align: HAlign) => void,
): Placement {
  return { key, rect, align, slot, priority: priorityOf(key, !!slot), drawAt }
}

/**
 * Turn the pinned items into placements. Everything sharing a cell is anchored
 * as one stack, in `order`, so two things dropped in the same corner sit one
 * above the other rather than on top of each other.
 */
export function pinnedPlacements(env: RenderEnv, items: PinnedItem[]): Placement[] {
  const regions = presetRegions(env.state, env.w, env.h)
  const cells = new Map<string, PinnedItem[]>()
  for (const it of items) {
    const k = `${it.slot.region}:${it.slot.v}:${it.slot.h}`
    const group = cells.get(k)
    if (group) group.push(it)
    else cells.set(k, [it])
  }
  const out: Placement[] = []
  for (const group of cells.values()) {
    group.sort((a, b) => (a.slot.order ?? 0) - (b.slot.order ?? 0))
    const { v, h, region: regionKey } = group[0].slot
    const region = (regionKey === 'image' ? regions.image : regions.text) ?? regions.text
    const align = alignForCell(h)
    const stackH = group.reduce((sum, it) => sum + it.box.h, 0)
    let y = Math.max(0, Math.min(anchorY(region, v, stackH), env.h - stackH))
    for (const it of group) {
      const x = Math.max(0, Math.min(anchorX(region, h, it.box.w), env.w - it.box.w))
      out.push(
        placement(it.key, { x, y, w: it.box.w, h: it.box.h }, align, it.slot, it.drawAt),
      )
      y += it.box.h
    }
  }
  return out
}

export interface PresetPlan {
  elements: PlacedElement[]
}

/**
 * Run `layout` for `state` without painting, collecting where every element
 * lands. `ctx` should be an offscreen context — nothing drawn to it matters, but
 * text measurement needs a real 2D context.
 */
export function planPreset(
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  w: number,
  h: number,
  assets: RenderAssets,
): PresetPlan {
  const elements: PlacedElement[] = []
  const env = buildRenderEnv(ctx, state, w, h, assets, 1)
  env.collect = (el) => elements.push(el)
  env.measuring = true
  if (state.layout === 'split') drawSplitLayout(env)
  else if (state.layout === 'editorial') drawEditorialLayout(env)
  else drawCenteredLayout(env)
  return { elements }
}

/** True when `p` is inside `r`. */
export const hits = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
