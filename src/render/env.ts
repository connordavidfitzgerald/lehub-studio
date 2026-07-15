import type { PosterState, Palette } from '../types'
import type { Grid } from './grid'

export interface RenderAssets {
  logo: HTMLImageElement | null
  /** Loaded paper textures keyed by paper id. */
  papers: Record<string, HTMLImageElement | null>
}

/** What an on-canvas region maps to, for click-to-edit / image-change overlays. */
export type HitTarget =
  | { kind: 'header' }
  | { kind: 'category' }
  | { kind: 'secondary'; index: number }
  | { kind: 'image' }

/** A rectangle on the poster (in poster pixels) tied to an editable target. */
export interface HitRegion {
  target: HitTarget
  x: number
  y: number
  w: number
  h: number
}

/** Everything a layout needs to draw one poster. */
export interface RenderEnv {
  ctx: CanvasRenderingContext2D
  state: PosterState
  palette: Palette
  g: Grid
  w: number
  h: number
  /** Short edge (drives constant sizes). */
  shortEdge: number
  secondarySize: number
  categorySize: number
  logoHeight: number
  assets: RenderAssets
  /** >1 when exporting at higher resolution. */
  renderScale: number
  /** Optional sink for editable regions (preview only; unused on export). */
  collect?: (region: HitRegion) => void
}
