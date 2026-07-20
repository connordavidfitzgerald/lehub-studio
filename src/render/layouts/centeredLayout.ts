import { HEADER_MAX_RATIO, LOGO, PAD_RATIO, SECONDARY_TRACKING } from '../../config/constants'
import { HEADER_FONT, SECONDARY_FONT } from '../../config/fonts'
import type { RenderEnv } from '../env'
import {
  capitalizeFirst,
  drawBadge,
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureSecondaryItem,
  type HeaderBlock,
} from '../elements'
import { fitHeader, wrapWords } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'

// Rough badge/line height as a multiple of font size (ascent + descent + pad).
const BADGE_H = 0.95

/**
 * Centred layout: category, header and secondary text stacked and centred, the
 * header wrapped to 2–3 words per line and spanning the middle-8-columns or the
 * full width. Logo sits bottom-centre. Background is the solid palette colour or
 * a halftoned full-bleed image.
 */
export function drawCenteredLayout(env: RenderEnv): void {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO

  // Background image (halftoned, full-bleed) sits behind the text; `solid` keeps
  // the palette fill already painted by renderPoster.
  if (state.bgMode === 'image' && state.image) {
    const ht = getHalftone(state.image, w * renderScale, h * renderScale, state.halftone, renderScale)
    ctx.drawImage(ht, 0, 0, w, h)
  }

  const container = state.headerWidth === 'cols8' ? env.g.middle8 : env.g.full
  // Respect explicit line breaks; otherwise auto-wrap to ~3 words per line.
  const lines = state.header.includes('\n')
    ? state.header.split('\n').filter((l) => l.trim() !== '')
    : wrapWords(state.header, 3)
  // Generous height budget so the header keeps filling the container width up to
  // ~6–8 wrapped lines before the height clamp forces it to auto-shrink.
  const { size } = fitHeader(ctx, lines, HEADER_FONT, container.width, pad, h * 0.85, shortEdge * HEADER_MAX_RATIO)

  // Estimate block heights so we can vertically centre the stack.
  const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
  const catText = capitalizeFirst(state.category)
  // The label either pins to the canvas top-centre (out of the centred stack) or
  // stacks flush above the header.
  const labelAtTop = catText !== '' && state.centeredLabelPos === 'top'
  const catInStack = catText !== '' && !labelAtTop
  const catH = catInStack ? env.categorySize * BADGE_H : 0
  const headerH = lines.length * lineAdvance
  const secParas = state.paragraphs.filter((p) => p.text.trim() !== '')
  const secHeights = secParas.map((p) =>
    measureSecondaryItem(ctx, p, env.secondarySize, container.width, container.width, pad),
  )
  const secH = secHeights.reduce((a, b) => a + b, 0)

  const cx = w / 2

  // Top-centre label, pinned flush to the top edge (drawn independently of the
  // vertically-centred stack below).
  if (labelAtTop) {
    drawBadge(
      ctx,
      catText,
      SECONDARY_FONT,
      env.categorySize,
      cx,
      0,
      'center',
      palette.highlight,
      pad,
      SECONDARY_TRACKING,
    )
  }

  // No gap between the centred elements (they stack flush).
  const gap = 0
  const totalH = catH + gap + headerH + (secH ? gap + secH : 0)
  let y = (h - totalH) / 2

  if (catInStack) {
    drawBadge(
      ctx,
      catText,
      SECONDARY_FONT,
      env.categorySize,
      cx,
      y,
      'center',
      palette.highlight,
      pad,
      SECONDARY_TRACKING,
    )
    y += catH + gap
  }

  const block: HeaderBlock = {
    lines,
    size,
    containerX: container.x,
    containerWidth: container.width,
    align: 'center',
    lineAdvance,
  }
  drawHeaderBlock(ctx, block, y, shortEdge)
  y += headerH

  if (secH) {
    y += gap
    secParas.forEach((p, i) => {
      drawSecondaryItem(
        ctx,
        p,
        env.secondarySize,
        container.x,
        container.x + container.width,
        y,
        palette.secondaryBg,
        pad,
        'center',
        container.width,
      )
      y += secHeights[i]
    })
  }

  // Logo bottom-centre, flush to the bottom edge (no margin).
  drawLogo(ctx, env.assets.logo, cx, h, env.logoHeight, LOGO.fallbackText, 'center')
}
