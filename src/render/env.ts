import type { PosterState, Palette } from '../types'
import type { Grid } from './grid'

export interface RenderAssets {
  logo: HTMLImageElement | null
  /** Loaded paper textures keyed by paper id. */
  papers: Record<string, HTMLImageElement | null>
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
}
