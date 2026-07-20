import {
  HEADER_MAX_RATIO,
  LOGO,
  OUTLINE_COLOR,
  PAD_RATIO,
  SECONDARY_TRACKING,
} from '../../config/constants'
import { HEADER_FONT, SECONDARY_FONT } from '../../config/fonts'
import type { RenderEnv } from '../env'
import {
  capitalizeFirst,
  drawBadge,
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureSecondaryHeight,
  measureSecondaryItem,
  type HAlign,
  type HeaderBlock,
} from '../elements'
import { fitHeader } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'

/** Small deterministic PRNG (mulberry32) so a seed always yields the same layout. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rect = { x: number; y: number; w: number; h: number }
export type ImageMode = 'band-top' | 'band-bottom' | 'band-left' | 'band-right' | 'full'

/** Secondary paragraph containers span this many grid columns, independent of the header. */
const SECONDARY_COLS = 6

/**
 * Consume the two image draws at the head of the seeded sequence. Exported so the
 * Controls panel can label the image-position control to match the generated band
 * (top/bottom for a band across the poster, left/right for one down a side) — call
 * it with `mulberry32(seed)`. Must stay the first two draws, or layouts reshuffle.
 */
export function planImage(rand: () => number): { mode: ImageMode; bandFrac: number } {
  const modes: ImageMode[] = ['band-top', 'band-bottom', 'band-left', 'band-right', 'full']
  const mode = modes[Math.floor(rand() * modes.length)]
  const bandFrac = 3 + Math.floor(rand() * 4) // randInt(3, 6)
  return { mode, bandFrac }
}

/** The axis the band slides along, i.e. which labels the position control shows. */
export function imageAlignAxis(mode: ImageMode): 'vertical' | 'horizontal' {
  return mode === 'band-left' || mode === 'band-right' ? 'horizontal' : 'vertical'
}

/** Where the seeded mode puts the band — `full` has no band to move. */
export function seededBandPos(mode: ImageMode): 'start' | 'end' | null {
  if (mode === 'band-top' || mode === 'band-left') return 'start'
  if (mode === 'band-bottom' || mode === 'band-right') return 'end'
  return null
}

/**
 * Procedurally arrange the poster elements on the 10-column grid from `state.seed`.
 * An optional image block claims one region (band or full-bleed); the header,
 * category and secondary text stack together in the remaining "text zone" with a
 * randomised column span, horizontal alignment and vertical anchor. Logo stays
 * bottom-left. Deterministic: the same seed always reproduces the same layout.
 */
export function drawGenerativeLayout(env: RenderEnv): void {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO
  const colW = w / 10

  const rand = mulberry32(state.seed || 1)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

  // --- 1. Image region + resulting text zone. The mode and band size are always
  //        drawn from the seed, so the text composition below uses identical seeded
  //        choices whether or not an image is present. Without an image there is NO
  //        image slot (text uses the full canvas); adding an image afterwards
  //        reflows the *same* layout with the band carved in. ---
  const { mode: imageModePick, bandFrac } = planImage(rand)

  // The band slides along one axis; `genImageAlign` overrides the seeded end.
  // A centred band splits the canvas in two, so the text keeps the side the seed
  // originally gave it — that preserves the generated composition's character.
  const seededPos = seededBandPos(imageModePick)
  const bandPos = state.genImageAlign === 'auto' ? seededPos : state.genImageAlign

  let tz: Rect = { x: 0, y: 0, w, h }
  let imgRect: Rect | null = null
  if (state.image) {
    if (imageModePick === 'full') {
      imgRect = { x: 0, y: 0, w, h } // full-bleed, nowhere to slide
    } else if (imageAlignAxis(imageModePick) === 'vertical') {
      const bh = h * (bandFrac / 10)
      const rest = h - bh
      if (bandPos === 'start') {
        imgRect = { x: 0, y: 0, w, h: bh }
        tz = { x: 0, y: bh, w, h: rest }
      } else if (bandPos === 'end') {
        imgRect = { x: 0, y: rest, w, h: bh }
        tz = { x: 0, y: 0, w, h: rest }
      } else {
        imgRect = { x: 0, y: rest / 2, w, h: bh }
        // Text takes the half it had before: seeded-top band ⇒ text below.
        tz =
          seededPos === 'start'
            ? { x: 0, y: rest / 2 + bh, w, h: rest / 2 }
            : { x: 0, y: 0, w, h: rest / 2 }
      }
    } else {
      const bw = bandFrac * colW
      const rest = w - bw
      if (bandPos === 'start') {
        imgRect = { x: 0, y: 0, w: bw, h }
        tz = { x: bw, y: 0, w: rest, h }
      } else if (bandPos === 'end') {
        imgRect = { x: rest, y: 0, w: bw, h }
        tz = { x: 0, y: 0, w: rest, h }
      } else {
        imgRect = { x: rest / 2, y: 0, w: bw, h }
        tz =
          seededPos === 'start'
            ? { x: rest / 2 + bw, y: 0, w: rest / 2, h }
            : { x: 0, y: 0, w: rest / 2, h }
      }
    }
  }

  if (imgRect && state.image) {
    const ht = getHalftone(
      state.image,
      imgRect.w * renderScale,
      imgRect.h * renderScale,
      state.halftone,
      renderScale,
    )
    ctx.drawImage(ht, imgRect.x, imgRect.y, imgRect.w, imgRect.h)
  }

  // --- 2. Text composition. Header colour follows the slide type (main → pink,
  //        secondary → palette secondary colour). One alignment governs the whole
  //        block, so everything anchors to the zone's edges or its centre — never
  //        floating mid-column. `auto` biases strongly to the left. ---
  const outlineColor = state.slideType === 'main' ? OUTLINE_COLOR : palette.secondaryBg

  // Auto never generates right-aligned; it leans left with the occasional centre.
  const autoAlign = pick<HAlign>(['left', 'left', 'left', 'center', 'center'])
  const align: HAlign = state.genAlign === 'auto' ? autoAlign : state.genAlign
  const centered = align === 'center'

  // Header column span: `auto` is procedural, others are fixed. Primary slides get
  // a wider minimum so their headline never generates small. The random draw is
  // always consumed so changing the width setting doesn't reshuffle the rest.
  const tzCols = Math.max(1, Math.round(tz.w / colW))
  const autoSpanMin = Math.min(state.slideType === 'main' ? 6 : 4, tzCols)
  const autoSpan = randInt(autoSpanMin, tzCols)
  const spanCols =
    state.genHeaderWidth === 'narrow'
      ? Math.min(4, tzCols)
      : state.genHeaderWidth === 'wide'
        ? Math.min(8, tzCols)
        : state.genHeaderWidth === 'full'
          ? tzCols
          : autoSpan
  const headerW = spanCols * colW
  const headerX =
    align === 'left'
      ? tz.x
      : align === 'right'
        ? tz.x + tz.w - headerW
        : tz.x + (tz.w - headerW) / 2

  const lines = state.header.split('\n').filter((l) => l.trim() !== '')
  // A `full` header should actually reach the zone edges: drop the size ceiling and
  // give it more vertical room, so only a genuine lack of height holds it back.
  // Other widths keep the ceiling so a short headline doesn't balloon out of scale.
  const isFull = state.genHeaderWidth === 'full'
  const { size } = fitHeader(
    ctx,
    lines,
    HEADER_FONT,
    headerW,
    pad,
    tz.h * (isFull ? 0.8 : 0.6),
    isFull ? undefined : shortEdge * HEADER_MAX_RATIO,
  )
  const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
  const headerH = lines.length * lineAdvance

  // Category label: pinned to the text zone's top corner — top-left by convention,
  // top-centre only when the composition is centred. Reserves its height so the
  // header never rides over it.
  const catText = state.category.trim() ? capitalizeFirst(state.category) : ''
  const catH = catText ? measureSecondaryHeight(ctx, catText, env.categorySize, pad) : 0
  if (catText) {
    drawBadge(
      ctx,
      catText,
      SECONDARY_FONT,
      env.categorySize,
      centered ? tz.x + tz.w / 2 : tz.x,
      tz.y,
      centered ? 'center' : 'left',
      palette.highlight,
      pad,
      SECONDARY_TRACKING,
    )
  }

  // Secondary block, aligned with the header, spanning a seeded 4–6 columns.
  const secCols = Math.min(randInt(4, SECONDARY_COLS), tzCols)
  const secW = secCols * colW
  const secParas = state.paragraphs.filter((p) => p.text.trim() !== '')
  const secTotal = secParas.reduce(
    (sum, p) => sum + measureSecondaryItem(ctx, p, env.secondarySize, tz.w, secW, pad),
    0,
  )

  // --- 3. Vertical composition, inside the zone between the category (top) and the
  //        logo (bottom). Header + secondary either travel together (top / middle /
  //        bottom) or split to opposite ends. Bottom-anchored text only reserves the
  //        logo's height when it would actually sit over the logo; otherwise it
  //        drops flush to the bottom edge. ---
  const zoneReachesBottom = tz.y + tz.h >= h - 1
  const zoneBottom = tz.y + tz.h
  const subTop = tz.y + catH

  const logoImg = env.assets.logo
  const logoW =
    logoImg && logoImg.naturalHeight
      ? (logoImg.naturalWidth / logoImg.naturalHeight) * env.logoHeight
      : env.logoHeight * 3
  const logoLeft = centered ? tz.x + tz.w / 2 - logoW / 2 : 0
  const logoRight = logoLeft + logoW
  // Would a bottom block of width `blockW` (aligned like the text) sit over the logo?
  const overlapsLogo = (blockW: number) => {
    const cx = tz.x + tz.w / 2
    const left = align === 'left' ? tz.x : align === 'right' ? tz.x + tz.w - blockW : cx - blockW / 2
    return left + blockW > logoLeft && left < logoRight
  }
  // When it must clear the logo, sit flush on top of it — no gap.
  const bottomBound = (overlaps: boolean) =>
    zoneReachesBottom && overlaps ? Math.min(zoneBottom, h - env.logoHeight) : zoneBottom
  const place = (anchor: 'top' | 'middle' | 'bottom', groupH: number, overlaps = true) =>
    anchor === 'top'
      ? subTop
      : anchor === 'bottom'
        ? Math.max(subTop, bottomBound(overlaps) - groupH)
        : subTop + Math.max(0, (bottomBound(overlaps) - subTop - groupH) / 2)

  const block: HeaderBlock = {
    lines,
    size,
    containerX: headerX,
    containerWidth: headerW,
    align,
    lineAdvance,
    outlineColor,
  }
  const drawHeaderAt = (topY: number) => drawHeaderBlock(ctx, block, topY, shortEdge)
  const drawSecAt = (topY: number) => {
    let y = topY
    for (const p of secParas) {
      y += drawSecondaryItem(ctx, p, env.secondarySize, tz.x, tz.x + tz.w, y, palette.secondaryBg, pad, align, secW)
    }
  }

  const comp = pick<'top' | 'middle' | 'bottom' | 'split'>(['top', 'middle', 'bottom', 'split', 'split'])
  if (comp === 'split' && secTotal > 0) {
    // Header high, secondary low — opposite ends of the zone.
    drawHeaderAt(place('top', headerH))
    drawSecAt(place('bottom', secTotal, overlapsLogo(secW)))
  } else {
    // Header + secondary as one block, anchored top / middle / bottom. The lowest
    // element decides whether the group must clear the logo. A `split` pick with no
    // secondary centres the lone header rather than pinning it to the top.
    const anchor = comp === 'split' ? 'middle' : comp
    const lowestOverlaps = secTotal > 0 ? overlapsLogo(secW) : overlapsLogo(headerW)
    let y = place(anchor, headerH + secTotal, lowestOverlaps)
    drawHeaderAt(y)
    y += headerH
    if (secTotal > 0) drawSecAt(y)
  }

  // Logo: bottom-left by convention; bottom-centre aligned to the text when centred.
  drawLogo(
    ctx,
    env.assets.logo,
    centered ? tz.x + tz.w / 2 : 0,
    h,
    env.logoHeight,
    LOGO.fallbackText,
    centered ? 'center' : 'left',
  )
}
