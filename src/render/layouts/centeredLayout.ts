import { HEADER_MAX_RATIO, LOGO, PAD_RATIO, SECONDARY_TRACKING } from '../../config/constants'
import { HEADER_FONT, SECONDARY_FONT } from '../../config/fonts'
import type { GenElementKey } from '../../types'
import type { RenderEnv } from '../env'
import {
  capitalizeFirst,
  drawBadge,
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureBadgeBox,
  measureSecondaryItem,
  measureSecondaryItemBox,
  type HAlign,
  type HeaderBlock,
} from '../elements'
import { fitHeader, wrapWords } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'
import {
  clampHeaderCols,
  composePreset,
  logoBox,
  pinnedPlacements,
  placement,
  slotOf,
  type PinnedItem,
} from './presetPlan'
import type { Placement } from './generativePlan'

// Rough badge/line height as a multiple of font size (ascent + descent + pad).
const BADGE_H = 0.95

/**
 * Centred layout: category, header and secondary text stacked and centred, the
 * header wrapped to 2–3 words per line and spanning the middle-8-columns or the
 * full width. Logo sits bottom-centre. Background is the solid palette colour or
 * a halftoned full-bleed image.
 *
 * Any element dragged on the canvas is pinned to a cell of the 3×3 grid and
 * leaves the centred stack, which then closes up behind it.
 */
export function drawCenteredLayout(env: RenderEnv): void {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO

  // Background image (halftoned, full-bleed) sits behind the text; `solid` keeps
  // the palette fill already painted by renderPoster.
  // A planning pass only needs the geometry, and the shader is the expensive part.
  if (!env.measuring && state.bgMode === 'image' && state.image) {
    const ht = getHalftone(state.image, w * renderScale, h * renderScale, state.halftone, renderScale)
    ctx.drawImage(ht, 0, 0, w, h)
  }

  // A dragged header edge sets an explicit column span; otherwise the header
  // takes the middle-8 or the full width.
  const headerCols = clampHeaderCols(state.centeredHeaderCols)
  const container =
    headerCols !== null
      ? { x: (w - env.g.span(headerCols)) / 2, width: env.g.span(headerCols) }
      : state.headerWidth === 'cols8'
        ? env.g.middle8
        : env.g.full
  // Respect explicit line breaks; otherwise auto-wrap to ~3 words per line.
  const lines = state.header.includes('\n')
    ? state.header.split('\n').filter((l) => l.trim() !== '')
    : wrapWords(state.header, 3)
  // Generous height budget so the header keeps filling the container width up to
  // ~6–8 wrapped lines before the height clamp forces it to auto-shrink.
  const { size } = fitHeader(ctx, lines, HEADER_FONT, container.width, pad, h * 0.85, shortEdge * HEADER_MAX_RATIO)

  const pinned: PinnedItem[] = []
  const flow: Placement[] = []

  // Estimate block heights so we can vertically centre the stack.
  const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
  const catText = capitalizeFirst(state.category)
  const catSlot = slotOf(state, 'category')
  // The label either pins to the canvas top-centre (out of the centred stack),
  // stacks flush above the header, or has been dragged to a cell of its own.
  const labelAtTop = catText !== '' && !catSlot && state.centeredLabelPos === 'top'
  const catInStack = catText !== '' && !catSlot && !labelAtTop
  const catH = catInStack ? env.categorySize * BADGE_H : 0
  const headerH = lines.length * lineAdvance
  const kept = state.paragraphs
    .map((p, i) => ({ p, key: `p${i}` as GenElementKey }))
    .filter(({ p }) => p.text.trim() !== '')
  const secHeights = kept.map(({ p }) =>
    measureSecondaryItem(ctx, p, env.secondarySize, container.width, container.width, pad),
  )

  const cx = w / 2
  const catBox = catText
    ? measureBadgeBox(ctx, catText, SECONDARY_FONT, env.categorySize, pad, SECONDARY_TRACKING)
    : { w: 0, h: 0 }
  const drawCat = (x: number, y: number, align: HAlign) =>
    drawBadge(
      ctx,
      catText,
      SECONDARY_FONT,
      env.categorySize,
      align === 'center' ? x + catBox.w / 2 : align === 'right' ? x + catBox.w : x,
      y,
      align,
      palette.highlight,
      pad,
      SECONDARY_TRACKING,
    )

  if (catSlot) {
    pinned.push({ key: 'category', box: { w: catBox.w, h: catBox.h }, slot: catSlot, drawAt: drawCat })
  }

  // Top-centre label, pinned flush to the top edge (drawn independently of the
  // vertically-centred stack below).
  if (labelAtTop) {
    flow.push(
      placement(
        'category',
        { x: cx - catBox.w / 2, y: 0, w: catBox.w, h: catBox.h },
        'center',
        null,
        drawCat,
      ),
    )
  }

  const headerSlot = slotOf(state, 'header')
  const drawHeader = (x: number, y: number, align: HAlign) => {
    const block: HeaderBlock = {
      lines,
      size,
      containerX: x,
      containerWidth: container.width,
      align,
      lineAdvance,
    }
    drawHeaderBlock(ctx, block, y, shortEdge)
  }
  if (headerSlot) {
    pinned.push({
      key: 'header',
      box: { w: container.width, h: headerH },
      slot: headerSlot,
      drawAt: drawHeader,
    })
  }

  // Only what is still in the flow contributes to the centred stack's height.
  const flowingSecH = kept.reduce(
    (sum, { key }, i) => (slotOf(state, key) ? sum : sum + secHeights[i]),
    0,
  )
  // No gap between the centred elements (they stack flush).
  const gap = 0
  const totalH =
    catH + gap + (headerSlot ? 0 : headerH) + (flowingSecH ? gap + flowingSecH : 0)
  let y = (h - totalH) / 2

  if (catInStack) {
    flow.push(
      placement(
        'category',
        { x: cx - catBox.w / 2, y, w: catBox.w, h: catH },
        'center',
        null,
        drawCat,
      ),
    )
    y += catH + gap
  }

  if (!headerSlot) {
    flow.push(
      placement(
        'header',
        { x: container.x, y, w: container.width, h: headerH },
        'center',
        null,
        drawHeader,
      ),
    )
    y += headerH
  }

  if (flowingSecH) y += gap
  kept.forEach(({ p, key }, i) => {
    const box = measureSecondaryItemBox(ctx, p, env.secondarySize, container.width, container.width, pad)
    const drawPara = (x: number, top: number, align: HAlign) =>
      drawSecondaryItem(
        ctx,
        p,
        env.secondarySize,
        x,
        x + box.w,
        top,
        palette.secondaryBg,
        pad,
        align,
        box.w,
      )
    const slot = slotOf(state, key)
    if (slot) {
      pinned.push({ key, box: { w: box.w, h: secHeights[i] }, slot, drawAt: drawPara })
      return
    }
    flow.push(
      placement(key, { x: cx - box.w / 2, y, w: box.w, h: secHeights[i] }, 'center', null, drawPara),
    )
    y += secHeights[i]
  })

  // Logo bottom-centre, flush to the bottom edge (no margin), unless pinned.
  const logo = logoBox(env)
  const logoSlot = slotOf(state, 'logo')
  if (logoSlot) {
    pinned.push({
      key: 'logo',
      box: logo,
      slot: logoSlot,
      drawAt: (x, top) =>
        drawLogo(ctx, env.assets.logo, x, top + logo.h, env.logoHeight, LOGO.fallbackText, 'left'),
    })
  } else {
    flow.push(
      placement(
        'logo',
        { x: cx - logo.w / 2, y: h - logo.h, w: logo.w, h: logo.h },
        'center',
        null,
        (x, top) =>
          drawLogo(ctx, env.assets.logo, x, top + logo.h, env.logoHeight, LOGO.fallbackText, 'left'),
      ),
    )
  }

  composePreset(env, [...flow, ...pinnedPlacements(env, pinned)])
}
