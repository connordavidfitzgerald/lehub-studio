import type { GenElementKey, GenSlot, PosterState, Palette } from '../types'
import type { Grid } from './grid'

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * One thing a layout put on the canvas, keyed the same way pins are, so a drag
 * can write straight back to the element it grabbed.
 */
export interface PlacedElement {
  key: GenElementKey
  rect: Rect
  /** Horizontal alignment it was drawn with — the side a resize grows away from. */
  align?: 'left' | 'center' | 'right'
  /** The pin it is drawn at, or null when it follows the layout's own flow. */
  slot?: GenSlot | null
}

/**
 * Drop feedback for a drag in progress, in poster pixels. Drawn as an SVG over
 * the canvas and never into it, so exports stay clean. Both drag hooks produce
 * this, so the preview renders one shape whatever the layout.
 */
export interface DragOverlay {
  /** Where the dragged element would land if released now. */
  ghost: Rect
  /** Region highlighted behind the chosen target. */
  region: Rect | null
  /** Drop-target markers; `active` is the one that would win. */
  markers: { x: number; y: number; active: boolean }[]
  /** While resizing: the room the text would be left with. */
  textZone?: Rect | null
  /** While resizing: the grid the drag snaps to. */
  gridLines?: { x1: number; y1: number; x2: number; y2: number }[]
}

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
  /**
   * Set while planning rather than painting: the layout reports where it put
   * each element instead of the caller having to re-derive the geometry. The
   * preset layouts compute these rects on the way to drawing them anyway, so
   * hit-testing and the real render can never disagree.
   */
  collect?: (el: PlacedElement) => void
  /**
   * True while planning. Geometry doesn't depend on the pixels, so the costly
   * paints (the halftone shader above all) are skipped on a planning pass.
   */
  measuring?: boolean
}
