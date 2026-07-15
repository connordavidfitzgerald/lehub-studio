/**
 * Per-glyph measurement for the notched-outline engine.
 *
 * We advance the cursor by each grapheme's own measured width and DRAW the
 * header glyph-by-glyph using those same advances (see layouts), so the outline
 * boxes and the drawn letterforms always line up exactly — no kerning drift.
 */

export interface GlyphBox {
  char: string
  /** Left/right x, relative to the line origin (baseline start = 0). */
  left: number
  right: number
  /** Distance above the baseline the ink reaches (>= 0). */
  ascent: number
  /** Distance below the baseline the ink reaches (>= 0). */
  descent: number
  /** Whitespace glyphs advance the cursor but contribute no box. */
  blank: boolean
}

export interface LineMeasure {
  text: string
  width: number
  /** Cap height taken from a reference uppercase glyph ("H"). */
  capAscent: number
  glyphs: GlyphBox[]
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment)
  return Array.from(text)
}

/**
 * Measure a line with `ctx.font` already set. Returns geometry relative to the
 * line origin, with the alphabetic baseline at y = 0 and ascent pointing up.
 */
export function measureLine(
  ctx: CanvasRenderingContext2D,
  rawText: string,
): LineMeasure {
  const prevBaseline = ctx.textBaseline
  const prevAlign = ctx.textAlign
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const capAscent = ctx.measureText('H').actualBoundingBoxAscent

  const glyphs: GlyphBox[] = []
  let cursor = 0
  for (const g of graphemes(rawText)) {
    const m = ctx.measureText(g)
    const advance = m.width
    const blank = g.trim() === '' || advance === 0
    glyphs.push({
      char: g,
      left: cursor,
      right: cursor + advance,
      ascent: blank ? 0 : m.actualBoundingBoxAscent,
      descent: blank ? 0 : m.actualBoundingBoxDescent,
      blank,
    })
    cursor += advance
  }

  ctx.textBaseline = prevBaseline
  ctx.textAlign = prevAlign
  return { text: rawText, width: cursor, capAscent, glyphs }
}
