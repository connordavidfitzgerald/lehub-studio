import {
  OUTLINE_COLOR,
  PAD_RATIO,
  PARAGRAPH_LINE_HEIGHT,
  SECONDARY_LINE_GAP,
  SECONDARY_TRACKING,
  TEXT_COLOR,
} from '../config/constants'
import { fontString, HEADER_FONT, SECONDARY_FONT, type BrandFont } from '../config/fonts'
import type { Paragraph } from '../types'
import { measureLine } from './text/measure'
import { buildNotchedOutline, fillOutline } from './text/notchedOutline'

export type HAlign = 'left' | 'center' | 'right'

/** Canvas `letterSpacing` isn't typed in every TS lib version; set it defensively. */
function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`
}

/** Sentence case: first letter capitalised, the rest lower-cased. */
export function capitalizeFirst(s: string): string {
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t
}

export interface HeaderBlock {
  lines: string[]
  size: number
  /** Container the widest line fills. */
  containerX: number
  containerWidth: number
  align: HAlign
  /** Vertical advance per line = cap-band box height (zero gap between lines). */
  lineAdvance: number
  /** Notched-box fill colour. Defaults to the brand pink (OUTLINE_COLOR). */
  outlineColor?: string
}

/** Cap-height ascent of the header font at `size` (drives zero-gap line advance). */
export function headerCapAscent(ctx: CanvasRenderingContext2D, size: number): number {
  ctx.font = fontString(HEADER_FONT, size)
  return ctx.measureText('H').actualBoundingBoxAscent
}

/**
 * Draw the header: a solid #FF669E background fitted to the all-caps text with
 * notches/tabs hugging any characters that exceed the cap-height band, with the
 * glyphs in black @ 60% on top. `blockTop` is the top y of the first line's box.
 */
export function drawHeaderBlock(
  ctx: CanvasRenderingContext2D,
  block: HeaderBlock,
  blockTop: number,
  shortEdge: number,
): void {
  const { lines, size, containerX, containerWidth, align, lineAdvance } = block
  const outlineColor = block.outlineColor ?? OUTLINE_COLOR
  const pad = shortEdge * PAD_RATIO

  setTracking(ctx, 0) // header uses the font's own kerning
  ctx.font = fontString(HEADER_FONT, size)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  lines.forEach((raw, i) => {
    const text = raw.toUpperCase()
    const line = measureLine(ctx, text)
    ctx.font = fontString(HEADER_FONT, size) // measureLine may reset state

    let originX: number
    if (align === 'left') originX = containerX + pad
    else if (align === 'right') originX = containerX + containerWidth - pad - line.width
    else originX = containerX + (containerWidth - line.width) / 2

    const baselineY = blockTop + i * lineAdvance + pad + line.capAscent

    // Fitted background first, then glyphs on top.
    const bgShape = buildNotchedOutline(line, originX, baselineY, { padX: pad, padY: pad })
    fillOutline(ctx, bgShape, outlineColor)

    ctx.fillStyle = TEXT_COLOR
    for (const g of line.glyphs) {
      if (g.blank) continue
      ctx.fillText(g.char, originX + g.left, baselineY)
    }
  })
}

/**
 * Draw a single line of text with a solid background fitted tightly to the
 * text's actual bounds (ascent + descent) plus `padPx` on all sides. Used for
 * the category label and secondary info. `tracking` is letter-spacing as a
 * fraction of the font size (negative = tighter).
 */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: BrandFont,
  size: number,
  /** Anchor x depends on align: left edge, centre, or right edge. */
  anchorX: number,
  topY: number,
  align: HAlign,
  bg: string,
  padPx: number,
  tracking = 0,
): number {
  setTracking(ctx, size * tracking)
  ctx.font = fontString(font, size)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const m = ctx.measureText(text)
  const ascent = m.actualBoundingBoxAscent
  const descent = m.actualBoundingBoxDescent
  const boxW = m.width + padPx * 2
  const boxH = ascent + descent + padPx * 2

  let boxX: number
  if (align === 'left') boxX = anchorX
  else if (align === 'right') boxX = anchorX - boxW
  else boxX = anchorX - boxW / 2

  ctx.fillStyle = bg
  ctx.fillRect(boxX, topY, boxW, boxH)

  ctx.fillStyle = TEXT_COLOR
  ctx.fillText(text, boxX + padPx, topY + padPx + ascent)
  setTracking(ctx, 0)
  return boxH
}

/**
 * Height of the stacked secondary block without drawing it — used to
 * bottom-anchor the block before calling {@link drawSecondary}.
 */
export function measureSecondaryHeight(
  ctx: CanvasRenderingContext2D,
  raw: string,
  size: number,
  padPx: number,
): number {
  const lines = raw.split('\n').filter((l) => l.trim() !== '')
  setTracking(ctx, size * SECONDARY_TRACKING)
  ctx.font = fontString(SECONDARY_FONT, size)
  ctx.textBaseline = 'alphabetic'
  let total = 0
  for (const line of lines) {
    const m = ctx.measureText(line)
    total += m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + padPx * 2
  }
  total += Math.max(0, lines.length - 1) * size * SECONDARY_LINE_GAP
  setTracking(ctx, 0)
  return total
}

/** Draw stacked secondary lines (tighter kerning); returns the block height. */
export function drawSecondary(
  ctx: CanvasRenderingContext2D,
  raw: string,
  size: number,
  anchorX: number,
  topY: number,
  align: HAlign,
  bg: string,
  padPx: number,
): number {
  const lines = raw.split('\n').filter((l) => l.trim() !== '')
  const gap = size * SECONDARY_LINE_GAP
  let y = topY
  lines.forEach((line, i) => {
    if (i > 0) y += gap
    const h = drawBadge(ctx, line, SECONDARY_FONT, size, anchorX, y, align, bg, padPx, SECONDARY_TRACKING)
    y += h
  })
  return y - topY
}

/**
 * Word-wrap a paragraph (respecting explicit `\n` breaks) to fit `contentWidth`
 * at the secondary font/size. Caller must leave the tracking reset afterwards.
 */
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  contentWidth: number,
): string[] {
  setTracking(ctx, size * SECONDARY_TRACKING)
  ctx.font = fontString(SECONDARY_FONT, size)
  const out: string[] = []
  for (const seg of text.split('\n')) {
    const words = seg.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let cur = ''
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word
      if (cur && ctx.measureText(trial).width > contentWidth) {
        out.push(cur)
        cur = word
      } else {
        cur = trial
      }
    }
    if (cur) out.push(cur)
  }
  setTracking(ctx, 0)
  return out
}

export interface ParagraphMetrics {
  lines: string[]
  height: number
}

/** Wrapped lines + total box height for an editorial paragraph container. */
export function measureParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  containerWidth: number,
  padPx: number,
): ParagraphMetrics {
  const lines = wrapParagraph(ctx, text, size, containerWidth - padPx * 2)
  ctx.font = fontString(SECONDARY_FONT, size)
  const m = ctx.measureText('Hg')
  const asc = m.actualBoundingBoxAscent
  const desc = m.actualBoundingBoxDescent
  const lineH = size * PARAGRAPH_LINE_HEIGHT
  const height = padPx * 2 + asc + desc + Math.max(0, lines.length - 1) * lineH
  return { lines, height }
}

/**
 * Draw a paragraph container: a solid `bg` behind the word-wrapped, left-aligned
 * text. Every line but the last sits in a full `containerWidth` block; the last
 * line's background is fitted to its own text width. Returns the box height.
 */
export function drawParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  boxX: number,
  topY: number,
  containerWidth: number,
  bg: string,
  padPx: number,
): number {
  const { lines, height } = measureParagraph(ctx, text, size, containerWidth, padPx)
  const n = lines.length
  const lineH = size * PARAGRAPH_LINE_HEIGHT

  ctx.font = fontString(SECONDARY_FONT, size)
  const asc = ctx.measureText('Hg').actualBoundingBoxAscent

  // Last line's fitted background width (text width + horizontal padding).
  setTracking(ctx, size * SECONDARY_TRACKING)
  ctx.font = fontString(SECONDARY_FONT, size)
  const lastWidth = n > 0 ? ctx.measureText(lines[n - 1]).width + padPx * 2 : 0
  setTracking(ctx, 0)

  ctx.fillStyle = bg
  if (n <= 1) {
    // Single line → the whole background is fitted to it.
    ctx.fillRect(boxX, topY, lastWidth, height)
  } else {
    // Full-width block for lines 0..n-2, then a fitted box for the last line.
    const splitY = topY + padPx + (n - 1) * lineH
    ctx.fillRect(boxX, topY, containerWidth, splitY - topY)
    ctx.fillRect(boxX, splitY, lastWidth, topY + height - splitY)
  }

  setTracking(ctx, size * SECONDARY_TRACKING)
  ctx.font = fontString(SECONDARY_FONT, size)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = TEXT_COLOR
  lines.forEach((line, i) => {
    ctx.fillText(line, boxX + padPx, topY + padPx + asc + i * lineH)
  })
  setTracking(ctx, 0)
  return height
}

/**
 * Word-wrap one secondary paragraph (respecting explicit `\n`) so each fitted
 * badge stays within `maxTextWidth`. A single over-long word is left to overflow.
 */
function wrapSecondary(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxTextWidth: number,
): string[] {
  setTracking(ctx, size * SECONDARY_TRACKING)
  ctx.font = fontString(SECONDARY_FONT, size)
  const out: string[] = []
  for (const seg of text.split('\n')) {
    const words = seg.split(/\s+/).filter(Boolean)
    if (!words.length) continue
    let cur = ''
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word
      if (cur && ctx.measureText(trial).width > maxTextWidth) {
        out.push(cur)
        cur = word
      } else {
        cur = trial
      }
    }
    if (cur) out.push(cur)
  }
  setTracking(ctx, 0)
  return out
}

interface FittedLine {
  text: string
  align: HAlign
}

/** Wrapped lines for a set of paragraphs; `alignOverride` forces one alignment. */
function buildFittedLines(
  ctx: CanvasRenderingContext2D,
  paragraphs: Paragraph[],
  size: number,
  maxTextWidth: number,
  alignOverride?: HAlign,
): FittedLine[] {
  const out: FittedLine[] = []
  for (const p of paragraphs) {
    if (!p.text.trim()) continue
    const align = alignOverride ?? p.side
    for (const line of wrapSecondary(ctx, p.text, size, maxTextWidth))
      out.push({ text: line, align })
  }
  return out
}

/**
 * Height of a stack of secondary paragraphs rendered as fitted (per-line) badges
 * that wrap to `maxWidth`. Used to bottom-anchor the block before drawing.
 */
export function measureFittedParagraphs(
  ctx: CanvasRenderingContext2D,
  paragraphs: Paragraph[],
  size: number,
  maxWidth: number,
  padPx: number,
): number {
  const lines = buildFittedLines(ctx, paragraphs, size, Math.max(1, maxWidth - padPx * 2))
  setTracking(ctx, size * SECONDARY_TRACKING)
  ctx.font = fontString(SECONDARY_FONT, size)
  ctx.textBaseline = 'alphabetic'
  const gap = size * SECONDARY_LINE_GAP
  let total = 0
  lines.forEach((l, i) => {
    if (i > 0) total += gap
    const m = ctx.measureText(l.text)
    total += m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + padPx * 2
  })
  setTracking(ctx, 0)
  return total
}

/**
 * Draw a stack of secondary paragraphs as fitted badges within `[leftX, rightX]`.
 * Each paragraph aligns left/right/(centre) — per its `side`, or `alignOverride`
 * if given — and wraps to the available width. Returns the block height.
 */
export function drawFittedParagraphs(
  ctx: CanvasRenderingContext2D,
  paragraphs: Paragraph[],
  size: number,
  leftX: number,
  rightX: number,
  topY: number,
  bg: string,
  padPx: number,
  alignOverride?: HAlign,
): number {
  const lines = buildFittedLines(
    ctx,
    paragraphs,
    size,
    Math.max(1, rightX - leftX - padPx * 2),
    alignOverride,
  )
  const gap = size * SECONDARY_LINE_GAP
  const cx = (leftX + rightX) / 2
  let y = topY
  lines.forEach((l, i) => {
    if (i > 0) y += gap
    const anchorX = l.align === 'left' ? leftX : l.align === 'right' ? rightX : cx
    const boxH = drawBadge(ctx, l.text, SECONDARY_FONT, size, anchorX, y, l.align, bg, padPx, SECONDARY_TRACKING)
    y += boxH
  })
  return y - topY
}

/**
 * Height of one secondary element: fitted badges wrapping to `fittedWidth`, or a
 * paragraph block of `paraWidth`. Returns 0 for empty text.
 */
export function measureSecondaryItem(
  ctx: CanvasRenderingContext2D,
  p: Paragraph,
  size: number,
  fittedWidth: number,
  paraWidth: number,
  padPx: number,
): number {
  if (!p.text.trim()) return 0
  return p.style === 'paragraph'
    ? measureParagraph(ctx, p.text, size, paraWidth, padPx).height
    : measureFittedParagraphs(ctx, [p], size, fittedWidth, padPx)
}

/**
 * Draw one secondary element within `[leftX, rightX]` at `topY`, `align`ed. Fitted
 * = badges hugging each wrapped line; paragraph = a `paraWidth`-wide block. Returns
 * the drawn height.
 */
export function drawSecondaryItem(
  ctx: CanvasRenderingContext2D,
  p: Paragraph,
  size: number,
  leftX: number,
  rightX: number,
  topY: number,
  bg: string,
  padPx: number,
  align: HAlign,
  paraWidth: number,
): number {
  if (!p.text.trim()) return 0
  if (p.style === 'paragraph') {
    const boxX =
      align === 'left'
        ? leftX
        : align === 'right'
          ? rightX - paraWidth
          : leftX + (rightX - leftX - paraWidth) / 2
    return drawParagraph(ctx, p.text, size, boxX, topY, paraWidth, bg, padPx)
  }
  return drawFittedParagraphs(ctx, [p], size, leftX, rightX, topY, bg, padPx, align)
}

/**
 * Logo anchored by its bottom edge. `align` controls horizontal anchoring:
 * 'left' → `anchorX` is the left edge; 'center' → `anchorX` is the centre.
 * Size stays constant across layouts.
 */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  anchorX: number,
  bottomY: number,
  height: number,
  fallbackText: string,
  align: 'left' | 'center',
): void {
  if (img && img.naturalWidth) {
    const w = (img.naturalWidth / img.naturalHeight) * height
    const x = align === 'left' ? anchorX : anchorX - w / 2
    ctx.drawImage(img, x, bottomY - height, w, height)
    return
  }
  ctx.font = fontString(HEADER_FONT, height)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = align === 'left' ? 'left' : 'center'
  ctx.fillStyle = TEXT_COLOR
  const m = ctx.measureText(fallbackText)
  const baseline = bottomY - (height - m.actualBoundingBoxAscent) / 2
  ctx.fillText(fallbackText, anchorX, baseline)
  ctx.textAlign = 'left'
}
