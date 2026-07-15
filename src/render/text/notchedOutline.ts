import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'
import type { LineMeasure } from './measure'

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const EPS = 0.5

const rectToPoly = (r: Rect): Polygon => [
  [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
    [r.x0, r.y0],
  ],
]

export interface OutlineOpts {
  padX: number
  padY: number
}

/**
 * Build the notched "block outline" for one header line.
 *
 * A flat rectangle spans the cap-height band across the whole line; extra "tab"
 * rectangles are added ONLY over glyphs that exceed cap height (accents above,
 * commas/cedillas/descenders below). Unioning them yields a single stepped
 * polygon whose outline steps up/down to hug those characters.
 *
 * Coordinates are absolute: origin `x0` and alphabetic `baselineY`.
 */
export function buildNotchedOutline(
  line: LineMeasure,
  x0: number,
  baselineY: number,
  { padX, padY }: OutlineOpts,
): MultiPolygon {
  const inked = line.glyphs.filter((g) => !g.blank)
  if (inked.length === 0) return []

  const capAscent = line.capAscent
  const textLeft = Math.min(...inked.map((g) => g.left))
  const textRight = Math.max(...inked.map((g) => g.right))

  const rects: Rect[] = []

  // Base cap-height band across the full text extent.
  rects.push({
    x0: x0 + textLeft - padX,
    y0: baselineY - capAscent - padY,
    x1: x0 + textRight + padX,
    y1: baselineY + padY,
  })

  for (const g of inked) {
    const gl = x0 + g.left - padX
    const gr = x0 + g.right + padX
    // Tab upward for ascenders/accents that rise above the cap band.
    if (g.ascent > capAscent + EPS) {
      rects.push({
        x0: gl,
        y0: baselineY - g.ascent - padY,
        x1: gr,
        y1: baselineY, // overlaps band so the union merges
      })
    }
    // Tab downward for descenders (commas, cedillas, tails).
    if (g.descent > EPS) {
      rects.push({
        x0: gl,
        y0: baselineY - capAscent, // overlaps band
        x1: gr,
        y1: baselineY + g.descent + padY,
      })
    }
  }

  const polys = rects
    .filter((r) => r.x1 > r.x0 && r.y1 > r.y0)
    .map(rectToPoly)

  if (polys.length === 0) return []
  const [first, ...rest] = polys
  return polygonClipping.union(first, ...rest)
}

/** Fill a MultiPolygon as a solid text background fitted to the notched shape. */
export function fillOutline(
  ctx: CanvasRenderingContext2D,
  multi: MultiPolygon,
  color: string,
): void {
  if (multi.length === 0) return
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  for (const polygon of multi) {
    for (const ring of polygon) {
      ring.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
  }
  // Non-zero winding fills the union solid (any holes handled by even-odd order).
  ctx.fill()
  ctx.restore()
}
