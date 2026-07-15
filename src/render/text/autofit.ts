import { fontString, type BrandFont } from '../../config/fonts'

const REF = 100
/** Line advance as a multiple of font size (cap band + notch/outline breathing room). */
export const HEADER_LINE_HEIGHT = 1.18

export interface FitResult {
  size: number
  lines: string[]
}

/**
 * Split a headline into balanced lines of `maxWords` (default 3) words each,
 * used by the centered layout.
 */
export function wrapWords(text: string, maxWords = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const nLines = Math.ceil(words.length / maxWords)
  const perLine = Math.ceil(words.length / nLines)
  const lines: string[] = []
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(' '))
  }
  return lines
}

/**
 * Compute the single font size (shared by all lines) at which the WIDEST line
 * exactly fills `containerWidth`, accounting for the outline's horizontal
 * padding. Optionally clamp so the block fits `containerHeight`.
 */
export function fitHeader(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  font: BrandFont,
  containerWidth: number,
  padPx: number,
  containerHeight?: number,
  maxSize?: number,
): FitResult {
  ctx.font = fontString(font, REF)
  const widestRef = Math.max(
    1,
    ...lines.map((l) => ctx.measureText(l.toUpperCase()).width),
  )
  // width(size) + 2 * padPx = containerWidth; text width is linear in size.
  let size = ((containerWidth - 2 * padPx) * REF) / widestRef

  if (containerHeight) {
    const maxByHeight = containerHeight / (lines.length * HEADER_LINE_HEIGHT)
    size = Math.min(size, maxByHeight)
  }
  // Ceiling keeps short/one-word headlines from ballooning out of the type scale.
  if (maxSize) size = Math.min(size, maxSize)
  return { size: Math.max(1, size), lines }
}
