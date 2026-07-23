import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { DragOverlay, RenderAssets } from '../render/env'
import {
  anchorX,
  anchorY,
  bandFillsCanvas,
  clampBandUnits,
  clampHeaderCols,
  imageBandRect,
  planGenerative,
  type BandPos,
  GRID_UNITS,
  type ElementKey,
  type GenerativePlan,
  type PlannedElement,
  type Rect,
  type ResizeEdge,
  type SlotTarget,
} from '../render/layouts/generativePlan'
import { buildRenderEnv } from '../render/renderPoster'
import { applyGenSlot, usePoster } from '../store/usePoster'
import type { GenImageAlign, GenSlot, PosterState } from '../types'

/** Movement (in poster px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 6

export interface DragPreview {
  key: ElementKey
  /** Where the element will land if released now. */
  ghost: Rect
  /** The cell it will land in — null while dragging the image band. */
  slot: GenSlot | null
  /** Cells offered as drop targets, for overlay markers. */
  targets: SlotTarget[]
  /** Highlighted region behind the chosen cell. */
  region: Rect | null
  /** While resizing: the room the text would be left with (null once full-bleed). */
  textZone?: Rect | null
  /** While resizing: the grid the band snaps to. */
  gridLines?: { x1: number; y1: number; x2: number; y2: number }[]
}

const sameCell = (a: GenSlot | null | undefined, t: SlotTarget) =>
  !!a && a.region === t.region && a.v === t.v && a.h === t.h

/** Hit-test in reverse draw order so the element drawn on top wins. */
function elementAt(plan: GenerativePlan, x: number, y: number): PlannedElement | null {
  for (let i = plan.elements.length - 1; i >= 0; i--) {
    const el = plan.elements[i]
    if (!el.draggable) continue
    const r = el.rect
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return el
  }
  return null
}

/** Landing boxes within this many poster px of each other count as a tie. */
const TIE_EPS = 0.5

/** How close (in poster px) the pointer must be to an edge handle to grab it. */
const EDGE_GRAB = 14

/**
 * The header's resizable edge is the one opposite its anchor, so resizing grows
 * or shrinks it away from the side its text is aligned to. A centred header can
 * be taken by either edge and grows symmetrically.
 */
function headerEdgeAt(el: PlannedElement, x: number, y: number): HeaderResize | null {
  if (y < el.rect.y - EDGE_GRAB || y > el.rect.y + el.rect.h + EDGE_GRAB) return null
  const left = el.rect.x
  const right = el.rect.x + el.rect.w
  const nearLeft = Math.abs(x - left) <= EDGE_GRAB
  const nearRight = Math.abs(x - right) <= EDGE_GRAB
  if (el.align === 'left' && nearRight) return { align: 'left', anchor: left }
  if (el.align === 'right' && nearLeft) return { align: 'right', anchor: right }
  if (el.align === 'center' && (nearLeft || nearRight)) {
    return { align: 'center', anchor: (left + right) / 2 }
  }
  return null
}

/** Columns the header would span with its free edge dropped at `x`. */
function headerColsAt(hr: HeaderResize, x: number, colW: number, maxCols: number): number {
  const width =
    hr.align === 'left' ? x - hr.anchor : hr.align === 'right' ? hr.anchor - x : 2 * Math.abs(x - hr.anchor)
  return clampHeaderCols(width / colW, maxCols)
}

/** A header resize in progress: which anchor stays put while the edge moves. */
interface HeaderResize {
  align: 'left' | 'center' | 'right'
  anchor: number
}

/** The room a band of this size leaves the text: everything beyond the band. */
function textZoneFor(band: Rect, axis: 'x' | 'y', from: BandPos, w: number, h: number): Rect {
  const after = from === 'start'
  if (axis === 'y') {
    const top = after ? band.y + band.h : 0
    return { x: 0, y: top, w, h: after ? h - top : band.y }
  }
  const left = after ? band.x + band.w : 0
  return { x: left, y: 0, w: after ? w - left : band.x, h }
}

/** Grid units the band would take if its inner edge were dropped at `pos`. */
function unitsAt(edge: ResizeEdge, pos: number, len: number): number {
  const unit = len / GRID_UNITS
  const raw = edge.from === 'start' ? pos / unit : (len - pos) / unit
  return clampBandUnits(raw)
}

interface Drag {
  key: ElementKey
  plan: GenerativePlan
  /** Set when the band's edge was grabbed: this drag resizes rather than moves. */
  resize: ResizeEdge | null
  /** Set when the header's edge was grabbed: this drag re-spans the header. */
  headerResize: HeaderResize | null
  /** Header span (grid columns) the current pointer position would commit. */
  cols: number | null
  /** Band size the header resize would push the image to, when it needs the room. */
  imageSize: number | null
  /** Band size (grid units) the current pointer position would commit. */
  units: number | null
  /** Pointer offset inside the element's box when it was grabbed. */
  grabDX: number
  grabDY: number
  /** Where the press started, so a click can be told from a drag. */
  startX: number
  startY: number
  box: { w: number; h: number }
  moved: boolean
  preview: DragPreview
  imageAlign: GenImageAlign | null
}

/**
 * Drag-and-drop placement for the generative layout. Elements snap to a 3×3
 * anchor grid in the text zone and (when present) over the image; the image band
 * itself slides along its own axis. Nothing is committed until the pointer is
 * released, so a drag can be abandoned with Escape.
 */
export function useGenerativeDrag(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  state: PosterState,
  w: number,
  h: number,
  assets: RenderAssets,
  enabled: boolean,
) {
  const setGenSlot = usePoster((st) => st.setGenSlot)
  const set = usePoster((st) => st.set)
  const setMany = usePoster((st) => st.setMany)
  const [drag, setDrag] = useState<Drag | null>(null)
  // The cursor doubles as the affordance: grab for a move, a resize arrow on the
  // band's edge.
  const [hover, setHover] = useState<'grab' | 'col-resize' | 'row-resize' | null>(null)
  const measureRef = useRef<CanvasRenderingContext2D | null>(null)

  // Plan against an offscreen context: the plan is geometry only, and its draw
  // closures are never invoked here, so the visible canvas is left alone.
  const planFor = useCallback(
    (s: PosterState) => {
      if (!enabled) return null
      if (!measureRef.current) {
        measureRef.current = document.createElement('canvas').getContext('2d')
      }
      const ctx = measureRef.current
      if (!ctx) return null
      return planGenerative(buildRenderEnv(ctx, s, w, h, assets, 1))
    },
    [enabled, w, h, assets],
  )

  const plan = useMemo(() => planFor(state), [planFor, state])

  /** Client coordinates → poster pixels (the canvas is uniformly CSS-scaled). */
  const toPoster = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const r = canvas.getBoundingClientRect()
      if (!r.width || !r.height) return null
      return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h }
    },
    [canvasRef, w, h],
  )

  /** Where the dragged element would land in `target`, and at which stack index. */
  const resolve = useCallback(
    (d: Drag, target: SlotTarget, px: number, py: number) => {
      const occupants = d.plan.elements
        .filter((el) => el.key !== d.key && sameCell(el.slot, target))
        .sort((a, b) => (a.slot?.order ?? 0) - (b.slot?.order ?? 0))
      // Insert above the occupants the pointer sits above.
      let index = occupants.length
      for (let i = 0; i < occupants.length; i++) {
        if (py < occupants[i].rect.y + occupants[i].rect.h / 2) {
          index = i
          break
        }
      }
      const stackH = occupants.reduce((sum, el) => sum + el.rect.h, 0) + d.box.h
      const top = Math.max(0, Math.min(anchorY(target.regionRect, target.v, stackH), h - stackH))
      const before = occupants.slice(0, index).reduce((sum, el) => sum + el.rect.h, 0)
      const x = Math.max(0, Math.min(anchorX(target.regionRect, target.h, d.box.w), w - d.box.w))
      const ghost: Rect = { x, y: top + before, w: d.box.w, h: d.box.h }
      // Rank by how close the landing box is to the box being dragged.
      const dx = ghost.x + ghost.w / 2 - (px - d.grabDX + d.box.w / 2)
      const dy = ghost.y + ghost.h / 2 - (py - d.grabDY + d.box.h / 2)
      // An element as wide as its region lands in the same place in all three
      // columns — only its alignment differs — so those cells tie on the box
      // distance. The pointer's own distance to the cell anchor breaks the tie,
      // which is what lets a full-width header be dragged left / centre / right.
      const anchorDist = Math.hypot(target.anchor.x - px, target.anchor.y - py)
      return { ghost, index, dist: Math.hypot(dx, dy), anchorDist }
    },
    [w, h],
  )

  /** Snap the image band to start / middle / end along the axis it slides on. */
  const resolveImage = useCallback(
    (d: Drag, px: number, py: number): { align: GenImageAlign; ghost: Rect } | null => {
      const img = d.plan.imgRect
      if (!img || !d.plan.imageAxis) return null
      const vertical = d.plan.imageAxis === 'vertical'
      // The band only ever hugs an end of its axis — never the middle.
      const options: GenImageAlign[] = ['start', 'end']
      const rectFor = (a: GenImageAlign): Rect =>
        vertical
          ? { ...img, y: a === 'start' ? 0 : h - img.h }
          : { ...img, x: a === 'start' ? 0 : w - img.w }
      const cur = vertical ? py - d.grabDY : px - d.grabDX
      let best = options[0]
      let bestDist = Infinity
      for (const a of options) {
        const r = rectFor(a)
        const dist = Math.abs((vertical ? r.y : r.x) - cur)
        if (dist < bestDist) {
          bestDist = dist
          best = a
        }
      }
      return { align: best, ghost: rectFor(best) }
    },
    [w, h],
  )

  const update = useCallback(
    (d: Drag, px: number, py: number): Drag => {
      if (d.headerResize) {
        const cols = headerColsAt(d.headerResize, px, d.plan.colW, d.plan.headerDragMaxCols)
        const width = cols * d.plan.colW
        const hr = d.headerResize
        const x =
          hr.align === 'left' ? hr.anchor : hr.align === 'right' ? hr.anchor - width : hr.anchor - width / 2
        // Grown past its zone, the header takes the room from the image beside it:
        // the band gives up columns rather than the header stopping at the divide.
        const imageSize = cols > d.plan.headerMaxCols ? GRID_UNITS - cols : null
        // Re-plan at the new span: a narrower container re-fits the headline to a
        // smaller size, so the ghost has to come from the real layout, not the box.
        const replan = planFor({
          ...state,
          genHeaderCols: cols,
          ...(imageSize != null ? { genImageSize: imageSize } : {}),
        })
        const landed = replan?.elements.find((e) => e.key === 'header')
        const ghost = landed?.rect ?? { x, y: d.preview.ghost.y, w: width, h: d.preview.ghost.h }
        const gridLines = Array.from({ length: GRID_UNITS - 1 }, (_, i) => {
          const at = d.plan.colW * (i + 1)
          return { x1: at, y1: 0, x2: at, y2: h }
        })
        return {
          ...d,
          cols,
          imageSize,
          preview: {
            ...d.preview,
            ghost,
            slot: null,
            region: null,
            gridLines,
            // Show the new divide when the band is being pushed back.
            textZone: imageSize != null ? (replan?.textZone ?? null) : null,
          },
        }
      }
      if (d.resize) {
        const axis = d.resize.axis
        const len = axis === 'y' ? h : w
        const units = unitsAt(d.resize, axis === 'y' ? py : px, len)
        // Past the limit the band stops being a band and fills the canvas, with the
        // text sitting over it — so there is no separate text zone left to show.
        const full = bandFillsCanvas(units)
        const ghost = full ? { x: 0, y: 0, w, h } : imageBandRect(axis, d.resize.from, units, w, h)
        const textZone = full ? null : textZoneFor(ghost, axis, d.resize.from, w, h)
        const gridLines = Array.from({ length: GRID_UNITS - 1 }, (_, i) => {
          const at = (len / GRID_UNITS) * (i + 1)
          return axis === 'y'
            ? { x1: 0, y1: at, x2: w, y2: at }
            : { x1: at, y1: 0, x2: at, y2: h }
        })
        return { ...d, units, preview: { ...d.preview, ghost, slot: null, region: null, textZone, gridLines } }
      }
      if (d.key === 'image') {
        const res = resolveImage(d, px, py)
        if (!res) return d
        return { ...d, imageAlign: res.align, preview: { ...d.preview, ghost: res.ghost, slot: null, region: null } }
      }
      let best: { target: SlotTarget; ghost: Rect; index: number; dist: number; anchorDist: number } | null =
        null
      for (const target of d.plan.slots) {
        const r = resolve(d, target, px, py)
        const wins =
          !best ||
          r.dist < best.dist - TIE_EPS ||
          (r.dist <= best.dist + TIE_EPS && r.anchorDist < best.anchorDist)
        if (wins) best = { target, ...r }
      }
      if (!best) return d
      const slot: GenSlot = {
        region: best.target.region,
        v: best.target.v,
        h: best.target.h,
        order: best.index,
      }
      // The nearest cell is chosen from the cheap anchor maths above, but where the
      // element actually lands also depends on what else is in the way — so re-plan
      // the poster as the drop would leave it and ghost the real result.
      const landed = planFor(applyGenSlot(state, d.key, slot))?.elements.find((e) => e.key === d.key)
      return {
        ...d,
        preview: {
          ...d.preview,
          ghost: landed?.rect ?? best.ghost,
          slot,
          region: best.target.regionRect,
        },
      }
    },
    [resolve, resolveImage, planFor, state, w, h],
  )

  /**
   * The image's edge wins the press when the pointer is right on it. A full-bleed
   * image offers all four, and its corners are within reach of two — the nearer
   * one takes the drag.
   */
  const edgeAt = useCallback(
    (p: { x: number; y: number }): ResizeEdge | null => {
      let best: ResizeEdge | null = null
      let bestDist = EDGE_GRAB
      for (const edge of plan?.resizeEdges ?? []) {
        const dist = Math.abs((edge.axis === 'y' ? p.y : p.x) - edge.pos)
        if (dist <= bestDist) {
          bestDist = dist
          best = edge
        }
      }
      return best
    },
    [plan],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!plan || e.button !== 0) return
      const p = toPoster(e)
      if (!p) return
      const headerEl = plan.elements.find((e) => e.key === 'header')
      const headerResize = headerEl ? headerEdgeAt(headerEl, p.x, p.y) : null
      const edge = headerResize ? null : edgeAt(p)
      const el = headerResize ? headerEl! : edge ? null : elementAt(plan, p.x, p.y)
      if (!headerResize && !edge && !el) return
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      const rect = el?.rect ?? plan.imgRect ?? { x: 0, y: 0, w, h }
      const d: Drag = {
        key: el?.key ?? 'image',
        plan,
        resize: edge,
        units: edge?.units ?? null,
        headerResize,
        cols: headerResize ? plan.headerCols : null,
        imageSize: null,
        grabDX: p.x - rect.x,
        grabDY: p.y - rect.y,
        startX: p.x,
        startY: p.y,
        box: { w: rect.w, h: rect.h },
        moved: false,
        imageAlign: null,
        preview: {
          key: el?.key ?? 'image',
          ghost: rect,
          slot: el?.slot ?? null,
          targets: el && el.key !== 'image' ? plan.slots : [],
          region: null,
        },
      }
      setDrag(update(d, p.x, p.y))
    },
    [plan, toPoster, update, edgeAt, w, h],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const p = toPoster(e)
      if (!p) return
      if (!drag) {
        const headerEl = plan?.elements.find((e) => e.key === 'header')
        if (headerEl && headerEdgeAt(headerEl, p.x, p.y)) {
          setHover('col-resize')
          return
        }
        const edge = edgeAt(p)
        setHover(edge ? (edge.axis === 'y' ? 'row-resize' : 'col-resize') : plan && elementAt(plan, p.x, p.y) ? 'grab' : null)
        return
      }
      const moved =
        drag.moved || Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD
      setDrag(update({ ...drag, moved }, p.x, p.y))
    },
    [drag, plan, toPoster, update, edgeAt],
  )

  // Commit outside the `setDrag` updater: React runs updater functions during the
  // render phase, and a store write from there updates other components mid-render.
  const finish = useCallback(
    (commit: boolean) => {
      const d = drag
      setDrag(null)
      if (d && commit && d.moved) {
        if (d.headerResize) {
          if (d.cols !== null) set('genHeaderCols', d.cols)
          if (d.imageSize !== null) set('genImageSize', d.imageSize)
        } else if (d.resize) {
          // Which edge was pulled decides the band's axis and the side it hugs,
          // so a full-bleed image can be brought in from any of the four.
          if (d.units !== null && d.units !== d.resize.units) {
            setMany(
              {
                genImageAxis: d.resize.axis,
                genImageAlign: d.resize.from,
                genImageSize: d.units,
              },
              'gen:image-resize',
            )
          }
        } else if (d.key === 'image') {
          if (d.imageAlign) set('genImageAlign', d.imageAlign)
        } else if (d.preview.slot) {
          setGenSlot(d.key, d.preview.slot)
        }
      }
    },
    [drag, set, setMany, setGenSlot],
  )

  const onPointerUp = useCallback(() => finish(true), [finish])
  const onPointerCancel = useCallback(() => finish(false), [finish])
  const onPointerLeave = useCallback(() => setHover(null), [])

  // Escape abandons the drag, leaving the element where it was.
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag, finish])

  const preview = drag && drag.moved ? drag.preview : null
  // Flatten to the shape the preview's overlay renders, so both drag hooks feed
  // it the same thing.
  const overlay: DragOverlay | null = preview && {
    ghost: preview.ghost,
    region: preview.region,
    markers: preview.targets.map((t) => ({
      x: t.anchor.x,
      y: t.anchor.y,
      active:
        !!preview.slot &&
        preview.slot.region === t.region &&
        preview.slot.v === t.v &&
        preview.slot.h === t.h,
    })),
    textZone: preview.textZone,
    gridLines: preview.gridLines,
  }

  return {
    /** Non-null while dragging: everything the overlay needs to draw. */
    overlay,
    cursor: drag
      ? drag.headerResize
        ? 'col-resize'
        : drag.resize
          ? drag.resize.axis === 'y'
            ? 'row-resize'
            : 'col-resize'
          : 'grabbing'
      : (hover ?? 'default'),
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave }
      : {},
  }
}
