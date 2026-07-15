import { HEADER_MAX_RATIO, LOGO, PAD_RATIO, SECONDARY_TRACKING } from '../../config/constants'
import { fontString, HEADER_FONT, SECONDARY_FONT } from '../../config/fonts'
import type { HalfPosition, Paragraph, SecondaryPos } from '../../types'
import type { RenderEnv } from '../env'
import {
  capitalizeFirst,
  drawBadge,
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureSecondaryItem,
  type HAlign,
  type HeaderBlock,
} from '../elements'
import { fitHeader } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'
import { collectImage, tagCategory, tagHeader, tagSecondary } from '../hit'

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
  items: Paragraph[],
  half: HalfPosition,
  corner: SecondaryPos,
): void {
  if (!items.length) return
  const { ctx, palette, w, h, shortEdge } = env
  const pad = shortEdge * PAD_RATIO
  const size = env.secondarySize
  const paraWidth = env.g.span(SPLIT_PARA_COLS)

  const regionY0 = half === 'top' ? 0 : h / 2
  const regionH = h / 2
  const isBottomCorner = corner.startsWith('bottom')
  const isRight = corner.endsWith('right')
  const align: HAlign = isRight ? 'right' : 'left'
  const atCanvasBottom = half === 'bottom' && isBottomCorner

  // A right block resting at the very bottom wraps before the logo; a left one sits above it.
  const leftX = atCanvasBottom && isRight ? logoWidth(env) : 0
  const rightX = w
  const groupH = items.reduce(
    (sum, p) => sum + measureSecondaryItem(ctx, p, size, rightX - leftX, paraWidth, pad),
    0,
  )

  let topY: number
  if (!isBottomCorner) topY = regionY0
  else if (atCanvasBottom && !isRight) topY = h - env.logoHeight - groupH // bottom-left: above the logo
  else topY = regionY0 + regionH - groupH

  let y = topY
  for (const p of items) {
    y += drawSecondaryItem(ctx, p, size, leftX, rightX, y, palette.secondaryBg, pad, align, paraWidth, tagSecondary(env, p))
  }
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
  const halfH = h / 2
  const textTop = state.textHalf === 'top'
  const splitY = halfH

  const textY0 = textTop ? 0 : halfH
  const imageY0 = textTop ? halfH : 0

  // When the image is in the bottom half, crop it so its bottom edge rests
  // above the logo (which sits bottom-left).
  const imageOnBottom = textTop
  const logoReserve = env.logoHeight
  const imgRegion = {
    x: 0,
    y: imageY0,
    w,
    h: imageOnBottom ? halfH - logoReserve : halfH,
  }

  // --- Image half (halftone) ---
  if (state.image) {
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
  collectImage(env, imgRegion.x, imgRegion.y, imgRegion.w, imgRegion.h)

  // --- Text half: category badge anchored at the half's TOP-LEFT edge. ---
  const badgeTop = textY0
  const catText = capitalizeFirst(state.category)
  const catRowH = catText
    ? drawBadge(
        ctx,
        catText,
        SECONDARY_FONT,
        env.categorySize,
        0,
        badgeTop,
        'left',
        palette.highlight,
        pad,
        SECONDARY_TRACKING,
        tagCategory(env),
      )
    : 0

  // --- Secondary text ---
  // Text-half items keep their corners; only the corner pressed against the centre
  // split — where the header hugs — would collide with the header, so it clusters
  // beside the header and pushes it clear. The other (outer) corner stays put.
  // Image-half items keep their corner slots over the image.
  const secSize = env.secondarySize
  const paraWidth = env.g.span(SPLIT_PARA_COLS)
  const secItems = state.paragraphs.filter((p) => p.text.trim() !== '')

  const textItems = secItems.filter((p) => p.half === state.textHalf)
  const groupAt = (pos: SecondaryPos) => textItems.filter((p) => p.position === pos)
  const measureGroup = (items: Paragraph[]) =>
    items.reduce((sum, p) => sum + measureSecondaryItem(ctx, p, secSize, w, paraWidth, pad), 0)
  const drawGroup = (items: Paragraph[], topY: number, align: HAlign) => {
    let y = topY
    for (const p of items) {
      y += drawSecondaryItem(ctx, p, secSize, 0, w, y, palette.secondaryBg, pad, align, paraWidth, tagSecondary(env, p))
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
  const block: HeaderBlock = {
    lines,
    size,
    containerX: 0,
    containerWidth: w,
    align: 'left',
    lineAdvance,
  }
  headerTop = textTop ? splitY - botSecH - blockH : availTop + topSecH

  drawGroup(topLeft, topLeftTop, 'left')
  drawGroup(topRight, topRightTop, 'right')
  drawHeaderBlock(ctx, block, headerTop, shortEdge, tagHeader(env))
  drawGroup(botLeft, botLeftTop, 'left')
  drawGroup(botRight, botRightTop, 'right')

  // Image-half secondaries keep their corner slots (over the image).
  const imageHalf: HalfPosition = textTop ? 'bottom' : 'top'
  for (const corner of SECONDARY_CORNERS) {
    const group = secItems.filter((p) => p.half === imageHalf && p.position === corner)
    drawSecondaryGroup(env, group, imageHalf, corner)
  }

  // Logo: bottom-left corner of the poster.
  drawLogo(ctx, env.assets.logo, 0, h, env.logoHeight, LOGO.fallbackText, 'left')
}
