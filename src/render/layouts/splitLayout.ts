import { HEADER_MAX_RATIO, LOGO, PAD_RATIO, SECONDARY_TRACKING } from '../../config/constants'
import { fontString, HEADER_FONT, SECONDARY_FONT } from '../../config/fonts'
import type { GenElementKey, HalfPosition, Paragraph, SecondaryPos } from '../../types'
import type { RenderEnv } from '../env'
import {
  capitalizeFirst,
  drawBadge,
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureSecondaryItem,
  measureBadgeBox,
  measureSecondaryItemBox,
  type HAlign,
  type HeaderBlock,
} from '../elements'
import { fitHeader } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'
import {
  composePreset,
  logoBox,
  pinnedPlacements,
  placement,
  slotOf,
  splitRegions,
  type PinnedItem,
} from './presetPlan'
import type { Placement } from './generativePlan'

/** Paragraph-style secondary containers span this many grid columns in the split layout. */
const SPLIT_PARA_COLS = 5

/** Width of the logo (bottom-left), used to keep bottom-right text off it. */
function logoWidth(env: RenderEnv): number {
  const img = env.assets.logo
  if (img && img.naturalWidth) return (img.naturalWidth / img.naturalHeight) * env.logoHeight
  env.ctx.font = fontString(HEADER_FONT, env.logoHeight)
  return env.ctx.measureText(LOGO.fallbackText).width
}

/**
 * Draw the secondary elements sharing one (half, corner) slot, stacked. The
 * corner is taken relative to the chosen half, so a bottom corner of the top half
 * sits just above the centre line, and a top corner of the bottom half just below
 * it. When a group rests at the very canvas bottom, a left one sits above the logo
 * and a right one wraps before it, so neither overlaps the bottom-left logo.
 */
function drawSecondaryGroup(
  env: RenderEnv,
  items: Indexed[],
  half: HalfPosition,
  corner: SecondaryPos,
  flow: Placement[],
): void {
  if (!items.length) return
  const { ctx, palette, w, h, shortEdge } = env
  const pad = shortEdge * PAD_RATIO
  const size = env.secondarySize
  const paraWidth = env.g.span(SPLIT_PARA_COLS)

  // The halves follow the (draggable) divide, not a fixed midpoint.
  const regions = splitRegions(env.state, w, h)
  const topH = env.state.textHalf === 'top' ? regions.text.h : regions.image.h
  const regionY0 = half === 'top' ? 0 : topH
  const regionH = half === 'top' ? topH : h - topH
  const isBottomCorner = corner.startsWith('bottom')
  const isRight = corner.endsWith('right')
  const align: HAlign = isRight ? 'right' : 'left'
  const atCanvasBottom = half === 'bottom' && isBottomCorner

  // A right block resting at the very bottom wraps before the logo; a left one sits above it.
  const leftX = atCanvasBottom && isRight ? logoWidth(env) : 0
  const rightX = w
  const groupH = items.reduce(
    (sum, { p }) => sum + measureSecondaryItem(ctx, p, size, rightX - leftX, paraWidth, pad),
    0,
  )

  let topY: number
  if (!isBottomCorner) topY = regionY0
  else if (atCanvasBottom && !isRight) topY = h - env.logoHeight - groupH // bottom-left: above the logo
  else topY = regionY0 + regionH - groupH

  let y = topY
  for (const { p, key } of items) {
    const box = measureSecondaryItemBox(ctx, p, size, rightX - leftX, paraWidth, pad)
    const drawn = measureSecondaryItem(ctx, p, size, rightX - leftX, paraWidth, pad)
    flow.push(
      placement(
        key,
        { x: isRight ? rightX - box.w : leftX, y, w: box.w, h: drawn },
        align,
        null,
        (x, top, a) =>
          drawSecondaryItem(ctx, p, size, x, x + box.w, top, palette.secondaryBg, pad, a, box.w),
      ),
    )
    y += drawn
  }
}

/** A paragraph paired with the key its pin is stored under. */
interface Indexed {
  p: Paragraph
  key: GenElementKey
}

const SECONDARY_CORNERS: SecondaryPos[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

/**
 * Half-and-half layout. One half holds the text block (category top-left,
 * header hugging the centre split); the other holds the halftone image. Two
 * independent secondary-text instances can be placed in the corners of the top
 * and bottom halves. `textHalf` chooses which side the text lives on.
 */
export function drawSplitLayout(env: RenderEnv): void {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO
  const textTop = state.textHalf === 'top'
  // The divide is draggable, so the two halves are only even until it is moved.
  const regions = splitRegions(state, w, h)
  const splitY = textTop ? regions.image.y : regions.image.y + regions.image.h
  const textY0 = regions.text.y

  // When the image is in the bottom half, crop it so its bottom edge rests
  // above the logo (which sits bottom-left).
  const imageOnBottom = textTop
  const logoReserve = env.logoHeight
  const imgRegion = {
    x: 0,
    y: regions.image.y,
    w,
    h: imageOnBottom ? regions.image.h - logoReserve : regions.image.h,
  }

  // --- Image half (halftone). A planning pass wants the geometry, not the pixels. ---
  if (env.measuring) {
    // nothing to paint
  } else if (state.image) {
    const ht = getHalftone(
      state.image,
      imgRegion.w * renderScale,
      imgRegion.h * renderScale,
      state.halftone,
      renderScale,
    )
    ctx.drawImage(ht, imgRegion.x, imgRegion.y, imgRegion.w, imgRegion.h)
  } else {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(imgRegion.x, imgRegion.y, imgRegion.w, imgRegion.h)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.font = `${env.secondarySize}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      'Upload an image',
      imgRegion.x + w / 2,
      imgRegion.y + imgRegion.h / 2,
    )
    ctx.restore()
  }

  // Elements dragged out of the preset arrangement, placed at their cells; the
  // rest keep the layout's own composition. Everything is drawn together at the
  // end so overlaps can be pushed apart first.
  const pinned: PinnedItem[] = []
  const flow: Placement[] = []

  // --- Text half: category badge anchored at the half's TOP-LEFT edge. ---
  const badgeTop = textY0
  const catText = capitalizeFirst(state.category)
  const catSlot = slotOf(state, 'category')
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
  let catRowH = 0
  if (catText && catSlot) {
    pinned.push({ key: 'category', box: catBox, slot: catSlot, drawAt: drawCat })
  } else if (catText) {
    catRowH = catBox.h
    flow.push(
      placement('category', { x: 0, y: badgeTop, w: catBox.w, h: catRowH }, 'left', null, drawCat),
    )
  }

  // --- Secondary text ---
  // Text-half items keep their corners; only the corner pressed against the centre
  // split — where the header hugs — would collide with the header, so it clusters
  // beside the header and pushes it clear. The other (outer) corner stays put.
  // Image-half items keep their corner slots over the image.
  const secSize = env.secondarySize
  const paraWidth = env.g.span(SPLIT_PARA_COLS)
  // Keys ride along so a dragged block writes back to the right entry. Pinned
  // blocks have left the corner arrangement, so they are held aside here.
  const allItems: Indexed[] = state.paragraphs
    .map((p, i) => ({ p, key: `p${i}` as GenElementKey }))
    .filter(({ p }) => p.text.trim() !== '')
  const secItems = allItems.filter(({ key }) => !slotOf(state, key))

  const textItems = secItems.filter(({ p }) => p.half === state.textHalf)
  const groupAt = (pos: SecondaryPos) => textItems.filter(({ p }) => p.position === pos)
  const measureGroup = (items: Indexed[]) =>
    items.reduce((sum, { p }) => sum + measureSecondaryItem(ctx, p, secSize, w, paraWidth, pad), 0)
  const drawGroup = (items: Indexed[], topY: number, align: HAlign) => {
    let y = topY
    for (const { p, key } of items) {
      const box = measureSecondaryItemBox(ctx, p, secSize, w, paraWidth, pad)
      const drawn = measureSecondaryItem(ctx, p, secSize, w, paraWidth, pad)
      flow.push(
        placement(
          key,
          { x: align === 'right' ? w - box.w : 0, y, w: box.w, h: drawn },
          align,
          null,
          (x, top, a) =>
            drawSecondaryItem(ctx, p, secSize, x, x + box.w, top, palette.secondaryBg, pad, a, box.w),
        ),
      )
      y += drawn
    }
  }
  const topLeft = groupAt('top-left')
  const topRight = groupAt('top-right')
  const botLeft = groupAt('bottom-left')
  const botRight = groupAt('bottom-right')
  const topLeftH = measureGroup(topLeft)
  const topRightH = measureGroup(topRight)
  const botLeftH = measureGroup(botLeft)
  const botRightH = measureGroup(botRight)
  // The corner pressed against the split shares one band beside the header (using
  // the taller of its two sides); the outer corners are placed individually below.
  const topSecH = Math.max(topLeftH, topRightH)
  const botSecH = Math.max(botLeftH, botRightH)

  const lines = state.header.split('\n').filter((l) => l.trim() !== '')
  const availTop = badgeTop + catRowH

  // Per-corner Y positions + the header's clear region. The corner on the SAME side
  // as a blocker (category is top-left, logo is bottom-left) is offset past it; the
  // opposite corner drops to the absolute edge. The corner against the split hugs
  // the header. The header fits the remaining span and hugs the split.
  let headerTop: number
  let topLeftTop: number
  let topRightTop: number
  let botLeftTop: number
  let botRightTop: number
  let availH: number
  if (textTop) {
    // Bottom corners hug the split beside the header (bottom-anchored to it).
    botLeftTop = splitY - botLeftH
    botRightTop = splitY - botRightH
    // Top corners are outer: left sits under the category, right goes to the very top.
    topLeftTop = availTop
    topRightTop = textY0
    const topReach = Math.max(topLeftTop + topLeftH, topRightTop + topRightH)
    availH = Math.max(shortEdge * 0.1, splitY - botSecH - topReach)
  } else {
    // Top corners hug the split beside the header (below the category).
    topLeftTop = availTop
    topRightTop = availTop
    // Bottom corners are outer: left sits above the logo, right goes to the very bottom.
    botLeftTop = h - env.logoHeight - botLeftH
    botRightTop = h - botRightH
    const botReach = Math.min(botLeftTop, botRightTop)
    availH = Math.max(shortEdge * 0.1, botReach - (availTop + topSecH))
  }

  const { size } = fitHeader(ctx, lines, HEADER_FONT, w, pad, availH, shortEdge * HEADER_MAX_RATIO)
  const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
  const blockH = lines.length * lineAdvance
  const drawHeader = (x: number, y: number, align: HAlign) => {
    const block: HeaderBlock = {
      lines,
      size,
      containerX: x,
      containerWidth: w,
      align,
      lineAdvance,
    }
    drawHeaderBlock(ctx, block, y, shortEdge)
  }
  headerTop = textTop ? splitY - botSecH - blockH : availTop + topSecH

  drawGroup(topLeft, topLeftTop, 'left')
  drawGroup(topRight, topRightTop, 'right')
  const headerSlot = slotOf(state, 'header')
  if (headerSlot) {
    pinned.push({ key: 'header', box: { w, h: blockH }, slot: headerSlot, drawAt: drawHeader })
  } else {
    flow.push(placement('header', { x: 0, y: headerTop, w, h: blockH }, 'left', null, drawHeader))
  }
  drawGroup(botLeft, botLeftTop, 'left')
  drawGroup(botRight, botRightTop, 'right')

  // Image-half secondaries keep their corner slots (over the image).
  const imageHalf: HalfPosition = textTop ? 'bottom' : 'top'
  for (const corner of SECONDARY_CORNERS) {
    const group = secItems.filter(({ p }) => p.half === imageHalf && p.position === corner)
    drawSecondaryGroup(env, group, imageHalf, corner, flow)
  }

  // Pinned paragraphs sit wherever they were dropped, at their own width.
  const paraWidthPinned = env.g.span(SPLIT_PARA_COLS)
  for (const { p, key } of allItems) {
    const slot = slotOf(state, key)
    if (!slot) continue
    const box = measureSecondaryItemBox(ctx, p, secSize, w, paraWidthPinned, pad)
    pinned.push({
      key,
      box,
      slot,
      drawAt: (x, top, align) =>
        drawSecondaryItem(ctx, p, secSize, x, x + box.w, top, palette.secondaryBg, pad, align, box.w),
    })
  }

  // Logo: bottom-left corner of the poster, unless it has been pinned elsewhere.
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
      placement('logo', { x: 0, y: h - logo.h, w: logo.w, h: logo.h }, 'left', null, (x, top) =>
        drawLogo(ctx, env.assets.logo, x, top + logo.h, env.logoHeight, LOGO.fallbackText, 'left'),
      ),
    )
  }

  composePreset(env, [...flow, ...pinnedPlacements(env, pinned)])
}
