import {
  HEADER_MAX_RATIO,
  LOGO,
  OUTLINE_COLOR,
  PAD_RATIO,
  SECONDARY_TRACKING,
} from '../../config/constants'
import { HEADER_FONT, SECONDARY_FONT } from '../../config/fonts'
import type { GenElementKey, GenSlot, GenSlotH, GenSlotV, Paragraph } from '../../types'
import type { Rect, RenderEnv } from '../env'
import {
  capitalizeFirst,
  drawBadge,
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureBadgeBox,
  measureSecondaryItemBox,
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

export type { Rect }
/** Which end of its axis the image band hugs. It is never centred. */
export type BandPos = 'start' | 'end'
export type ImageMode = 'band-top' | 'band-bottom' | 'band-left' | 'band-right' | 'full'

/** Secondary paragraph containers span this many grid columns, independent of the header. */
const SECONDARY_COLS = 6

/** The band is sized in tenths of the axis it spans, matching the 10-column grid. */
export const GRID_UNITS = 10

/** A band pushed aside by a growing header never shrinks below this. */
export const MIN_BAND_UNITS = 1

/**
 * The text zone never shrinks below this many grid units. A band dragged past the
 * limit stops being a band: the image fills the canvas and the text sits over it.
 */
export const MIN_TEXT_UNITS = 3

/** Grid units the band would occupy at a given size, clamped to something drawable. */
export function clampBandUnits(units: number): number {
  return Math.max(1, Math.min(GRID_UNITS, Math.round(units)))
}

/** Grid units left for the text once the band has taken its share. */
export function textUnitsFor(units: number): number {
  return GRID_UNITS - clampBandUnits(units)
}

/** True when a band of `units` leaves too little room for the text to live in. */
export function bandFillsCanvas(units: number): boolean {
  return textUnitsFor(units) < MIN_TEXT_UNITS
}

/**
 * The band's rect for a size in grid units. The band always hugs one end of the
 * axis, so the text keeps a single unbroken zone at the other.
 */
export function imageBandRect(
  axis: 'x' | 'y',
  pos: BandPos,
  units: number,
  w: number,
  h: number,
): Rect {
  const len = axis === 'y' ? h : w
  const band = len * (clampBandUnits(units) / GRID_UNITS)
  const start = pos === 'start' ? 0 : len - band
  return axis === 'y' ? { x: 0, y: start, w, h: band } : { x: start, y: 0, w: band, h }
}

/** Header spans a whole number of grid columns, never wider than its zone. */
export function clampHeaderCols(cols: number, maxCols: number): number {
  return Math.max(1, Math.min(maxCols, Math.round(cols)))
}

export type ElementKey = GenElementKey

export interface PlannedElement {
  key: ElementKey
  /** Poster-pixel bounds, for hit-testing and drag ghosts. */
  rect: Rect
  /** The pin this element is drawn at, or null when it follows the seeded flow. */
  slot: GenSlot | null
  /** How the element's content sits in its box — the anchor a resize holds fixed. */
  align: HAlign
  draggable: boolean
  draw: () => void
}

export interface SlotTarget {
  region: GenSlot['region']
  v: GenSlotV
  h: GenSlotH
  /** The region this cell belongs to — where a dropped element is anchored. */
  regionRect: Rect
  /** Anchor point of the cell, for overlay markers. */
  anchor: { x: number; y: number }
}

/** The image band's inner edge — the one facing the text — as a drag handle. */
export interface ResizeEdge {
  /** Axis the edge moves along: 'x' for a band down a side, 'y' for one across. */
  axis: 'x' | 'y'
  /** Current position of the edge along that axis. */
  pos: number
  /** Which end of the axis the band grows from. */
  from: BandPos
  /** The band's current size in grid units. */
  units: number
}

export interface GenerativePlan {
  elements: PlannedElement[]
  textZone: Rect
  imgRect: Rect | null
  /** The axis the image band slides along; null when full-bleed (can't move). */
  imageAxis: 'vertical' | 'horizontal' | null
  /**
   * Edges that can be dragged to resize the image. A band offers its one inner
   * edge; a full-bleed image offers all four sides, since which one you pull in
   * decides the axis and the side the band ends up hugging.
   */
  resizeEdges: ResizeEdge[]
  /** Header span in grid columns, and the widest it may get in its zone. */
  headerCols: number
  headerMaxCols: number
  /**
   * The widest the header may be *dragged* to. When the image sits beside the
   * text, the header can keep growing past its zone by pushing the band's edge
   * back — down to {@link MIN_BAND_UNITS} — so the two share the axis between them.
   */
  headerDragMaxCols: number
  /** Width of one grid column, i.e. the step a header resize snaps to. */
  colW: number
  slots: SlotTarget[]
}

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

/** Left x of a box of width `w` anchored to a region's left/centre/right. */
export function anchorX(region: Rect, h: GenSlotH, w: number): number {
  if (h === 'left') return region.x
  if (h === 'right') return region.x + region.w - w
  return region.x + (region.w - w) / 2
}

/** Top y of a stack of height `stackH` anchored to a region's top/middle/bottom. */
export function anchorY(region: Rect, v: GenSlotV, stackH: number): number {
  if (v === 'top') return region.y
  if (v === 'bottom') return region.y + region.h - stackH
  return region.y + (region.h - stackH) / 2
}

/** Every cell of a region's 3×3 anchor grid, as drop targets. */
function regionSlots(region: GenSlot['region'], rect: Rect): SlotTarget[] {
  const vs: GenSlotV[] = ['top', 'middle', 'bottom']
  const hs: GenSlotH[] = ['left', 'center', 'right']
  const out: SlotTarget[] = []
  for (const v of vs) {
    for (const h of hs) {
      out.push({
        region,
        v,
        h,
        regionRect: rect,
        anchor: {
          x: h === 'left' ? rect.x : h === 'right' ? rect.x + rect.w : rect.x + rect.w / 2,
          y: v === 'top' ? rect.y : v === 'bottom' ? rect.y + rect.h : rect.y + rect.h / 2,
        },
      })
    }
  }
  return out
}

/** A positioned element, before overlaps between elements have been resolved. */
export interface Placement {
  key: ElementKey
  rect: Rect
  slot: GenSlot | null
  align: HAlign
  /** Lower wins a contested spot; the loser is nudged clear of it. */
  priority: number
  drawAt: (x: number, y: number, align: HAlign) => void
}

/**
 * Who holds their ground when two elements want the same space. The category
 * label and the logo are fixtures — they read as furniture of the poster, so
 * everything else gives way to them (dragging a header onto the category label
 * parks it underneath). Pinned elements then beat the seeded flow, which is what
 * makes a drop land where it was aimed.
 */
export function priorityOf(key: ElementKey, pinned: boolean): number {
  if (key === 'category') return 0
  if (key === 'logo') return 1
  return pinned ? 2 : 3
}

/**
 * Boxes are stacked flush by design, so edges that merely touch must not count as
 * an overlap — a sub-pixel tolerance keeps rounding from prising a stack apart.
 */
const TOUCH_EPS = 0.5

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - TOUCH_EPS &&
  a.x + a.w > b.x + TOUCH_EPS &&
  a.y < b.y + b.h - TOUCH_EPS &&
  a.y + a.h > b.y + TOUCH_EPS

/**
 * Nudge elements vertically until nothing overlaps anything else. Elements are
 * settled in priority order (see {@link priorityOf}), each one sliding clear of
 * everything already settled: down by preference, up when there is no room
 * below. Whole stacks stay contiguous because each member pushes the next.
 */
export function resolveOverlaps(placed: Placement[], h: number): Placement[] {
  const order = placed
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.priority - b.p.priority || a.p.rect.y - b.p.rect.y || a.i - b.i)

  const settled: Rect[] = []
  const out = placed.slice()
  for (const { p, i } of order) {
    const slide = (dir: 1 | -1) => {
      let rect = p.rect
      // Each pass clears the first collision; repeat until the slot is free.
      for (let step = 0; step <= settled.length; step++) {
        const hit = settled.find((s) => intersects(rect, s))
        if (!hit) return rect
        const y = dir === 1 ? hit.y + hit.h : hit.y - rect.h
        if (y < 0 || y + rect.h > h) return null
        rect = { ...rect, y }
      }
      return null
    }
    const rect = slide(1) ?? slide(-1) ?? p.rect
    settled.push(rect)
    out[i] = rect === p.rect ? p : { ...p, rect }
  }
  return out
}

/** An element measured and ready to be positioned: a box plus a placement-agnostic draw. */
interface Item {
  key: ElementKey
  box: { w: number; h: number }
  /** Draw with the box's top-left at (x, y), text aligned per `align`. */
  drawAt: (x: number, y: number, align: HAlign) => void
  slot: GenSlot | null
}

/**
 * Procedurally arrange the poster elements on the 10-column grid from `state.seed`,
 * returning every element's box and draw call rather than drawing them. An optional
 * image block claims one region (band or full-bleed); the header, category and
 * secondary text stack together in the remaining "text zone" with a randomised
 * column span, horizontal alignment and vertical anchor. Elements carrying a
 * {@link GenSlot} are lifted out of that flow and pinned to a cell of their
 * region's 3×3 anchor grid instead, stacking with any others in the same cell.
 * Deterministic: the same seed always reproduces the same layout.
 */
export function planGenerative(env: RenderEnv): GenerativePlan {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO
  const colW = w / 10

  const rand = mulberry32(state.seed || 1)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

  const elements: PlannedElement[] = []

  // --- 1. Image region + resulting text zone. The mode and band size are always
  //        drawn from the seed, so the text composition below uses identical seeded
  //        choices whether or not an image is present. Without an image there is NO
  //        image slot (text uses the full canvas); adding an image afterwards
  //        reflows the *same* layout with the band carved in. ---
  const { mode: imageModePick, bandFrac } = planImage(rand)

  // The band slides along one axis; `genImageAlign` overrides the seeded end.
  // A centred band splits the canvas in two, so the text keeps the side the seed
  // originally gave it — that preserves the generated composition's character.
  // A stored poster may still carry an older centred value; anything that isn't a
  // recognised end falls back to the seeded one.
  const seededPos = seededBandPos(imageModePick)
  const bandPos: BandPos =
    state.genImageAlign === 'start' || state.genImageAlign === 'end'
      ? state.genImageAlign
      : (seededPos ?? 'start')

  // The band's size is seeded but overridable by dragging its inner edge. Past the
  // point where the text zone would fall below its minimum, the band gives up and
  // the image goes full-bleed with the text over it.
  const bandUnits = clampBandUnits(state.genImageSize ?? bandFrac)
  // Dragging a full-bleed image in by an edge picks the axis; until then it comes
  // from the seeded mode.
  const bandAxis: 'x' | 'y' =
    state.genImageAxis ?? (imageAlignAxis(imageModePick) === 'vertical' ? 'y' : 'x')
  // A seeded `full` has no band size of its own, so it stays full-bleed until an
  // edge is dragged in — which is what setting `genImageSize` records.
  const imageIsFull =
    (imageModePick === 'full' && state.genImageSize == null) || bandFillsCanvas(bandUnits)

  let tz: Rect = { x: 0, y: 0, w, h }
  let imgRect: Rect | null = null
  if (state.image) {
    if (imageIsFull) {
      imgRect = { x: 0, y: 0, w, h } // full-bleed, nowhere to slide
    } else {
      imgRect = imageBandRect(bandAxis, bandPos, bandUnits, w, h)
      // The band hugs one end, so the text takes the whole of what is left.
      const afterBand = bandPos === 'start'
      if (bandAxis === 'y') {
        const top = afterBand ? imgRect.y + imgRect.h : 0
        tz = { x: 0, y: top, w, h: (afterBand ? h - top : imgRect.y) }
      } else {
        const left = afterBand ? imgRect.x + imgRect.w : 0
        tz = { x: left, y: 0, w: afterBand ? w - left : imgRect.x, h }
      }
    }
  }

  const image = state.image
  if (imgRect && image) {
    const rect = imgRect
    elements.push({
      key: 'image',
      rect,
      slot: null,
      align: 'left',
      // The band slides between the ends of its axis; full-bleed can't move,
      // though its edge can still be dragged back in to recover a band.
      draggable: !imageIsFull,
      draw: () => {
        const ht = getHalftone(
          image,
          rect.w * renderScale,
          rect.h * renderScale,
          state.halftone,
          renderScale,
        )
        ctx.drawImage(ht, rect.x, rect.y, rect.w, rect.h)
      },
    })
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
  // Dragging the header's free edge sets an explicit span, which wins over the
  // width setting until it is reset.
  const spanCols =
    state.genHeaderCols != null
      ? clampHeaderCols(state.genHeaderCols, tzCols)
      : state.genHeaderWidth === 'narrow'
        ? Math.min(4, tzCols)
        : state.genHeaderWidth === 'wide'
          ? Math.min(8, tzCols)
          : state.genHeaderWidth === 'full'
            ? tzCols
            : autoSpan
  // `tzCols` rounds, so a zone that is half a column wide would otherwise hand the
  // header a container wider than the zone and push it off the canvas.
  const headerW = Math.min(spanCols * colW, tz.w)

  const lines = state.header.split('\n').filter((l) => l.trim() !== '')
  // A `full` header should actually reach the zone edges: drop the size ceiling and
  // give it more vertical room, so only a genuine lack of height holds it back.
  // Other widths keep the ceiling so a short headline doesn't balloon out of scale.
  // A dragged span is fitted the same way — the box you draw is the box the type
  // fills, or the drag appears to stop working while the container keeps growing.
  const isFull = state.genHeaderWidth === 'full' || state.genHeaderCols != null
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

  const catText = state.category.trim() ? capitalizeFirst(state.category) : ''
  const catBox = catText
    ? measureBadgeBox(ctx, catText, SECONDARY_FONT, env.categorySize, pad, SECONDARY_TRACKING)
    : { w: 0, h: 0 }

  // Secondary block, aligned with the header, spanning a seeded 4–6 columns.
  const secCols = Math.min(randInt(4, SECONDARY_COLS), tzCols)
  const secW = Math.min(secCols * colW, tz.w)

  const comp = pick<'top' | 'middle' | 'bottom' | 'split'>(['top', 'middle', 'bottom', 'split', 'split'])

  // --- 3. Build one measured, placement-agnostic item per element. Widths are
  //        measured against the region the element ends up in, so a pinned block
  //        wraps to its own region rather than to the text zone. ---
  const regionRect = (slot: GenSlot | null): Rect =>
    slot && slot.region === 'image' && imgRect ? imgRect : tz

  const headerSlot = state.genHeaderSlot ?? null
  const categorySlot = state.genCategorySlot ?? null
  const logoSlot = state.genLogoSlot ?? null

  const headerItem: Item | null = lines.length
    ? {
        key: 'header',
        box: { w: headerW, h: headerH },
        slot: headerSlot,
        drawAt: (x, y, a) => {
          const block: HeaderBlock = {
            lines,
            size,
            containerX: x,
            containerWidth: headerW,
            align: a,
            lineAdvance,
            outlineColor,
          }
          drawHeaderBlock(ctx, block, y, shortEdge)
        },
      }
    : null

  const categoryItem: Item | null = catText
    ? {
        key: 'category',
        box: catBox,
        slot: categorySlot,
        drawAt: (x, y, a) => {
          const ax = a === 'left' ? x : a === 'right' ? x + catBox.w : x + catBox.w / 2
          drawBadge(
            ctx,
            catText,
            SECONDARY_FONT,
            env.categorySize,
            ax,
            y,
            a,
            palette.highlight,
            pad,
            SECONDARY_TRACKING,
          )
        },
      }
    : null

  const secItems: Item[] = []
  state.paragraphs.forEach((p: Paragraph, i) => {
    if (!p.text.trim()) return
    const slot = p.genSlot ?? null
    // Fitted badges wrap to the width available in the element's own region.
    const availW = regionRect(slot).w
    const box = measureSecondaryItemBox(ctx, p, env.secondarySize, availW, secW, pad)
    if (box.h === 0) return
    secItems.push({
      key: `p${i}`,
      box,
      slot,
      drawAt: (x, y, a) => {
        // Re-derive a range of the measured width so wrapping matches, then let
        // drawSecondaryItem align the block inside it exactly as it was measured.
        const left = a === 'left' ? x : a === 'right' ? x + box.w - availW : x + box.w / 2 - availW / 2
        drawSecondaryItem(
          ctx,
          p,
          env.secondarySize,
          left,
          left + availW,
          y,
          palette.secondaryBg,
          pad,
          a,
          secW,
        )
      },
    })
  })

  const logoImg = env.assets.logo
  const logoW =
    logoImg && logoImg.naturalHeight
      ? (logoImg.naturalWidth / logoImg.naturalHeight) * env.logoHeight
      : env.logoHeight * 3
  const logoItem: Item = {
    key: 'logo',
    box: { w: logoW, h: env.logoHeight },
    slot: logoSlot,
    drawAt: (x, y) =>
      drawLogo(ctx, env.assets.logo, x, y + env.logoHeight, env.logoHeight, LOGO.fallbackText, 'left'),
  }

  // --- 4. Pinned elements: grouped by cell, stacked in `order`, anchored to the
  //        cell. Their alignment follows the cell's column, so an element pinned
  //        right reads as right-aligned against that region's right edge. ---
  const pinned = [categoryItem, headerItem, ...secItems, logoItem].filter(
    (it): it is Item => it !== null && it.slot !== null,
  )
  const cells = new Map<string, Item[]>()
  for (const it of pinned) {
    const s = it.slot!
    const key = `${s.region}:${s.v}:${s.h}`
    const list = cells.get(key)
    if (list) list.push(it)
    else cells.set(key, [it])
  }

  const placed: Placement[] = []
  for (const list of cells.values()) {
    list.sort((a, b) => (a.slot!.order ?? 0) - (b.slot!.order ?? 0))
    const s = list[0].slot!
    const region = regionRect(s)
    const stackH = list.reduce((sum, it) => sum + it.box.h, 0)
    const cellAlign: HAlign = s.h
    // Keep the stack on the canvas even when it is taller than its region.
    let y = Math.max(0, Math.min(anchorY(region, s.v, stackH), h - stackH))
    for (const it of list) {
      const x = Math.max(0, Math.min(anchorX(region, s.h, it.box.w), w - it.box.w))
      placed.push({
        key: it.key,
        rect: { x, y, w: it.box.w, h: it.box.h },
        slot: it.slot,
        align: cellAlign,
        priority: priorityOf(it.key, true),
        drawAt: it.drawAt,
      })
      y += it.box.h
    }
  }

  // --- 5. Auto elements: the seeded composition, measured as if the pinned ones
  //        were never there. Category (when auto) is pinned to the text zone's top
  //        corner and reserves its height so the header never rides over it. ---
  const autoSecs = secItems.filter((it) => it.slot === null)
  const secTotal = autoSecs.reduce((sum, it) => sum + it.box.h, 0)
  const autoHeader = headerItem && headerItem.slot === null ? headerItem : null
  const autoCat = categoryItem && categoryItem.slot === null ? categoryItem : null
  const autoLogo = logoItem.slot === null ? logoItem : null

  if (autoCat) {
    const x = centered ? tz.x + (tz.w - catBox.w) / 2 : tz.x
    placed.push({
      key: 'category',
      rect: { x, y: tz.y, w: catBox.w, h: catBox.h },
      slot: null,
      align: centered ? 'center' : 'left',
      priority: priorityOf('category', false),
      drawAt: autoCat.drawAt,
    })
  }

  // Logo: bottom-left by convention; bottom-centre aligned to the text when centred.
  const logoRect: Rect = autoLogo
    ? {
        x: centered ? tz.x + tz.w / 2 - logoW / 2 : 0,
        y: h - env.logoHeight,
        w: logoW,
        h: env.logoHeight,
      }
    : placed.find((e) => e.key === 'logo')!.rect

  if (autoLogo) {
    placed.push({
      key: 'logo',
      rect: logoRect,
      slot: null,
      align: 'left',
      priority: priorityOf('logo', false),
      drawAt: autoLogo.drawAt,
    })
  }

  // --- 6. Vertical composition, inside the zone between the category (top) and the
  //        logo (bottom). Header + secondary either travel together (top / middle /
  //        bottom) or split to opposite ends. Bottom-anchored text only reserves the
  //        logo's height when it would actually sit over the logo; otherwise it
  //        drops flush to the bottom edge. ---
  const zoneReachesBottom = tz.y + tz.h >= h - 1
  const zoneBottom = tz.y + tz.h
  const subTop = tz.y + (autoCat ? catBox.h : 0)

  const logoLeft = logoRect.x
  const logoRight = logoRect.x + logoRect.w
  // Only a logo actually sitting at the zone's bottom edge pushes text off it.
  const logoAtBottom = logoRect.y < zoneBottom && logoRect.y + logoRect.h >= zoneBottom - 1
  // Would a bottom block of width `blockW` (aligned like the text) sit over the logo?
  const overlapsLogo = (blockW: number) => {
    const cx = tz.x + tz.w / 2
    const left = align === 'left' ? tz.x : align === 'right' ? tz.x + tz.w - blockW : cx - blockW / 2
    return left + blockW > logoLeft && left < logoRight
  }
  // When it must clear the logo, sit flush on top of it — no gap.
  const bottomBound = (overlaps: boolean) =>
    zoneReachesBottom && overlaps && logoAtBottom ? Math.min(zoneBottom, logoRect.y) : zoneBottom
  const place = (anchor: 'top' | 'middle' | 'bottom', groupH: number, overlaps = true) =>
    anchor === 'top'
      ? subTop
      : anchor === 'bottom'
        ? Math.max(subTop, bottomBound(overlaps) - groupH)
        : subTop + Math.max(0, (bottomBound(overlaps) - subTop - groupH) / 2)

  const headerX =
    align === 'left'
      ? tz.x
      : align === 'right'
        ? tz.x + tz.w - headerW
        : tz.x + (tz.w - headerW) / 2

  const pushHeader = (topY: number) => {
    if (!autoHeader) return
    placed.push({
      key: 'header',
      rect: { x: headerX, y: topY, w: headerW, h: headerH },
      slot: null,
      align,
      priority: priorityOf('header', false),
      drawAt: autoHeader.drawAt,
    })
  }
  const pushSecs = (topY: number) => {
    let y = topY
    for (const it of autoSecs) {
      placed.push({
        key: it.key,
        rect: { x: anchorX(tz, align, it.box.w), y, w: it.box.w, h: it.box.h },
        slot: null,
        align,
        priority: priorityOf(it.key, false),
        drawAt: it.drawAt,
      })
      y += it.box.h
    }
  }

  const autoHeaderH = autoHeader ? headerH : 0
  // A pinned header leaves the split composition without its top half, so the
  // remaining secondaries fall back to the single-block branch (centred).
  const headerPinned = headerItem !== null && autoHeader === null
  if (comp === 'split' && secTotal > 0 && !headerPinned) {
    // Header high, secondary low — opposite ends of the zone.
    pushHeader(place('top', autoHeaderH))
    pushSecs(place('bottom', secTotal, overlapsLogo(secW)))
  } else {
    // Header + secondary as one block, anchored top / middle / bottom. The lowest
    // element decides whether the group must clear the logo. A `split` pick with no
    // secondary centres the lone header rather than pinning it to the top.
    const anchor = comp === 'split' ? 'middle' : comp
    const lowestOverlaps = secTotal > 0 ? overlapsLogo(secW) : overlapsLogo(headerW)
    let y = place(anchor, autoHeaderH + secTotal, lowestOverlaps)
    pushHeader(y)
    y += autoHeaderH
    if (secTotal > 0) pushSecs(y)
  }

  // Draw order: image first, then text in stacking order (category, header,
  // secondaries, logo) — `placed` already follows it closely enough that overlaps
  // read the same as before the split into plan + draw.
  const order: ElementKey[] = ['category', 'header', 'logo']
  const rank = (k: ElementKey) => (k.startsWith('p') ? 1.5 : order.indexOf(k))
  const resolved = resolveOverlaps(placed, h).sort((a, b) => rank(a.key) - rank(b.key))
  for (const p of resolved) {
    elements.push({
      key: p.key,
      rect: p.rect,
      slot: p.slot,
      align: p.align,
      draggable: true,
      draw: () => p.drawAt(p.rect.x, p.rect.y, p.align),
    })
  }

  const slots: SlotTarget[] = regionSlots('text', tz)
  if (imgRect) slots.push(...regionSlots('image', imgRect))

  // The resize handle sits on the band's inner edge. Once the image is full-bleed
  // every edge has reached a side of the canvas, so all four become handles:
  // pulling one inward re-forms the band on the opposite side. An edge dragged
  // from the canvas start leaves the band hugging the end, and vice versa.
  let resizeEdges: ResizeEdge[] = []
  if (imgRect && imageIsFull) {
    resizeEdges = [
      { axis: 'y', pos: 0, from: 'end', units: GRID_UNITS },
      { axis: 'y', pos: h, from: 'start', units: GRID_UNITS },
      { axis: 'x', pos: 0, from: 'end', units: GRID_UNITS },
      { axis: 'x', pos: w, from: 'start', units: GRID_UNITS },
    ]
  } else if (imgRect) {
    const textAfterBand = bandPos === 'start'
    const near = bandAxis === 'y' ? imgRect.y : imgRect.x
    const far = bandAxis === 'y' ? imgRect.y + imgRect.h : imgRect.x + imgRect.w
    resizeEdges = [
      { axis: bandAxis, pos: textAfterBand ? far : near, from: bandPos, units: bandUnits },
    ]
  }

  return {
    elements,
    textZone: tz,
    imgRect,
    imageAxis: imgRect && !imageIsFull ? (bandAxis === 'y' ? 'vertical' : 'horizontal') : null,
    resizeEdges,
    headerCols: spanCols,
    headerMaxCols: tzCols,
    // Only a band *beside* the text shares the header's axis, so only that one can
    // be pushed back; a band across the poster leaves the width alone.
    headerDragMaxCols:
      imgRect && !imageIsFull && bandAxis === 'x' && (state.genHeaderSlot ?? null)?.region !== 'image'
        ? GRID_UNITS - MIN_BAND_UNITS
        : tzCols,
    colW,
    slots,
  }
}
