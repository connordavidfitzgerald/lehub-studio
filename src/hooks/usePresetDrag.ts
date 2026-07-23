import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { GRID_COLUMNS } from '../config/constants'
import type { DragOverlay, PlacedElement, Rect, RenderAssets } from '../render/env'
import { anchorX, anchorY, type SlotTarget } from '../render/layouts/generativePlan'
import {
  clampHeaderCols,
  hits,
  isPresetLayout,
  MAX_SPLIT,
  MIN_SPLIT,
  planPreset,
  presetRegions,
  splitEdge,
  type PresetLayout,
} from '../render/layouts/presetPlan'
import { applyGenSlot, usePoster } from '../store/usePoster'
import type { GenElementKey, GenSlot, GenSlotH, GenSlotV, PosterState } from '../types'

/** Movement (in poster px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 6

/** How close (in poster px) the pointer must be to the header's edge to grab it. */
const EDGE_GRAB = 14

/** Landing boxes within this many poster px of each other count as a tie. */
const TIE_EPS = 0.5

/** Every cell of one region's 3×3 anchor grid, as drop targets. */
function regionSlots(region: 'text' | 'image', rect: Rect): SlotTarget[] {
  const vs: GenSlotV[] = ['top', 'middle', 'bottom']
  const hs: GenSlotH[] = ['left', 'center', 'right']
  const out: SlotTarget[] = []
  for (const v of vs) {
    for (const hh of hs) {
      out.push({
        region,
        v,
        h: hh,
        regionRect: rect,
        anchor: {
          x: hh === 'left' ? rect.x : hh === 'right' ? rect.x + rect.w : rect.x + rect.w / 2,
          y: v === 'top' ? rect.y : v === 'bottom' ? rect.y + rect.h : rect.y + rect.h / 2,
        },
      })
    }
  }
  return out
}

/**
 * The drop targets. Split has two zones — the text half and the image half — so
 * an element can be anchored to the corners of the image itself, exactly as in
 * the generative layout. Editorial and centered lay their image full-bleed
 * behind everything, so the canvas is one region.
 */
function slotsFor(state: PosterState, w: number, h: number): SlotTarget[] {
  const regions = presetRegions(state, w, h)
  const out = regionSlots('text', regions.text)
  if (regions.image) out.push(...regionSlots('image', regions.image))
  return out
}

const sameCell = (a: GenSlot | null | undefined, t: SlotTarget) =>
  !!a && a.region === t.region && a.v === t.v && a.h === t.h

/** The header's free edge is the one opposite the side its text is anchored to. */
interface HeaderResize {
  align: 'left' | 'center' | 'right'
  /** The edge that stays put while the other moves. */
  anchor: number
}

function headerEdgeAt(el: PlacedElement, x: number, y: number): HeaderResize | null {
  if (y < el.rect.y - EDGE_GRAB || y > el.rect.y + el.rect.h + EDGE_GRAB) return null
  const left = el.rect.x
  const right = el.rect.x + el.rect.w
  const nearLeft = Math.abs(x - left) <= EDGE_GRAB
  const nearRight = Math.abs(x - right) <= EDGE_GRAB
  const align = el.align ?? 'left'
  if (align === 'left' && nearRight) return { align, anchor: left }
  if (align === 'right' && nearLeft) return { align, anchor: right }
  // A centred header grows symmetrically, so either edge takes the drag.
  if (align === 'center' && (nearLeft || nearRight)) {
    return { align, anchor: (left + right) / 2 }
  }
  return null
}

/** Columns the header would span with its free edge dropped at `x`. */
function headerColsAt(hr: HeaderResize, x: number, colW: number): number {
  const width =
    hr.align === 'left'
      ? x - hr.anchor
      : hr.align === 'right'
        ? hr.anchor - x
        : 2 * Math.abs(x - hr.anchor)
  return clampHeaderCols(width / colW)!
}

interface Drag {
  key: GenElementKey
  elements: PlacedElement[]
  /** Set when the header's edge was grabbed: this drag re-spans it instead. */
  headerResize: HeaderResize | null
  /** Set when the split's divide was grabbed: this drag resizes the image half. */
  dividerDrag: boolean
  /** Split ratio the current pointer position would commit. */
  ratio: number | null
  /** Header span the current pointer position would commit. */
  cols: number | null
  /** The cell the element would land in if released now. */
  slot: GenSlot | null
  box: { w: number; h: number }
  grabDX: number
  grabDY: number
  startX: number
  startY: number
  moved: boolean
  overlay: DragOverlay
}

/**
 * Drag editing for the preset layouts, working the same way as the generative
 * one: anything on the canvas can be picked up and dropped into a cell of the
 * 3×3 anchor grid, where it stays pinned. A pinned element leaves its layout's
 * flow — the editorial stack, the split's corners — so the rest closes up behind
 * it. The header's free edge additionally resizes it across the column grid.
 *
 * Nothing commits until release, so a drag can be abandoned with Escape.
 */
export function usePresetDrag(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  state: PosterState,
  w: number,
  h: number,
  assets: RenderAssets,
  enabled: boolean,
) {
  const setGenSlot = usePoster((st) => st.setGenSlot)
  const setMany = usePoster((st) => st.setMany)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<'grab' | 'col-resize' | 'row-resize' | null>(null)
  const measureRef = useRef<CanvasRenderingContext2D | null>(null)

  const layout: PresetLayout | null =
    enabled && isPresetLayout(state.layout) ? state.layout : null

  /** Plan against an offscreen context so the visible canvas is left alone. */
  const planFor = useCallback(
    (s: PosterState): PlacedElement[] => {
      if (!layout) return []
      if (!measureRef.current) {
        measureRef.current = document.createElement('canvas').getContext('2d')
      }
      const ctx = measureRef.current
      if (!ctx) return []
      return planPreset(ctx, s, w, h, assets).elements
    },
    [layout, w, h, assets],
  )

  const elements = useMemo(() => planFor(state), [planFor, state])
  const slots = useMemo(() => slotsFor(state, w, h), [state, w, h])
  // Split only: the divide between the halves, draggable to resize the image.
  const divider = useMemo(() => splitEdge(state, w, h), [state, w, h])

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

  /** Hit-test in reverse draw order so whatever is on top wins the press. */
  const elementAt = useCallback(
    (x: number, y: number): PlacedElement | null => {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hits(elements[i].rect, x, y)) return elements[i]
      }
      return null
    },
    [elements],
  )

  const headerEl = useMemo(() => elements.find((e) => e.key === 'header') ?? null, [elements])

  /** Only these two layouts have a header span to drag. */
  const headerResizable = layout === 'editorial' || layout === 'centered'

  /** Where the dragged element would land in `target`, and at which stack index. */
  const resolve = useCallback(
    (d: Drag, target: SlotTarget, px: number, py: number) => {
      const occupants = d.elements
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
      const dx = ghost.x + ghost.w / 2 - (px - d.grabDX + d.box.w / 2)
      const dy = ghost.y + ghost.h / 2 - (py - d.grabDY + d.box.h / 2)
      // An element as wide as the canvas lands in the same place in all three
      // columns — only its alignment differs — so those cells tie on the box
      // distance. The pointer's own distance to the cell anchor breaks the tie.
      const anchorDist = Math.hypot(target.anchor.x - px, target.anchor.y - py)
      return { ghost, index, dist: Math.hypot(dx, dy), anchorDist }
    },
    [w, h],
  )

  const update = useCallback(
    (d: Drag, px: number, py: number): Drag => {
      if (!layout) return d

      if (d.dividerDrag) {
        // The divide follows the pointer; which side the image is on decides
        // whether that means a bigger or a smaller image.
        const frac = state.textHalf === 'top' ? (h - py) / h : py / h
        const ratio = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, frac))
        const next = { ...state, splitRatio: ratio }
        const regions = presetRegions(next, w, h)
        return {
          ...d,
          ratio,
          overlay: {
            ...d.overlay,
            ghost: regions.image ?? d.overlay.ghost,
            region: regions.text,
            markers: [],
          },
        }
      }

      if (d.headerResize) {
        const cols = headerColsAt(d.headerResize, px, w / GRID_COLUMNS)
        const field = layout === 'centered' ? 'centeredHeaderCols' : 'editorialHeaderCols'
        // Re-plan at the new span: a narrower container re-fits the headline to a
        // smaller size, so the ghost has to come from the real layout.
        const landed = planFor({ ...state, [field]: cols }).find((e) => e.key === 'header')
        const gridLines = Array.from({ length: GRID_COLUMNS - 1 }, (_, i) => {
          const at = (w / GRID_COLUMNS) * (i + 1)
          return { x1: at, y1: 0, x2: at, y2: h }
        })
        return {
          ...d,
          cols,
          overlay: {
            ...d.overlay,
            ghost: landed?.rect ?? d.overlay.ghost,
            region: null,
            markers: [],
            gridLines,
          },
        }
      }

      let best: { target: SlotTarget; ghost: Rect; index: number; dist: number; anchorDist: number } | null =
        null
      for (const target of slots) {
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
      // The nearest cell comes from the cheap anchor maths above, but where the
      // element actually lands also depends on what else is in the way — so plan
      // the poster as the drop would leave it and ghost the real result.
      const landed = planFor(applyGenSlot(state, d.key, slot)).find((e) => e.key === d.key)
      return {
        ...d,
        slot,
        overlay: {
          ...d.overlay,
          ghost: landed?.rect ?? best.ghost,
          region: best.target.regionRect,
          markers: slots.map((t) => ({
            x: t.anchor.x,
            y: t.anchor.y,
            active: sameCell(slot, t),
          })),
        },
      }
    },
    [layout, slots, resolve, planFor, state, w, h],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!layout || e.button !== 0) return
      const p = toPoster(e)
      if (!p) return
      const onDivider = divider !== null && Math.abs(p.y - divider) <= EDGE_GRAB
      const headerResize =
        !onDivider && headerResizable && headerEl ? headerEdgeAt(headerEl, p.x, p.y) : null
      const el = onDivider ? null : headerResize ? headerEl! : elementAt(p.x, p.y)
      if (!onDivider && !el) return
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      const rect = el?.rect ?? presetRegions(state, w, h).image ?? { x: 0, y: 0, w, h }
      const d: Drag = {
        key: el?.key ?? 'image',
        elements,
        headerResize,
        dividerDrag: onDivider,
        ratio: null,
        cols: null,
        slot: null,
        box: { w: rect.w, h: rect.h },
        grabDX: p.x - rect.x,
        grabDY: p.y - rect.y,
        startX: p.x,
        startY: p.y,
        moved: false,
        overlay: {
          ghost: rect,
          region: null,
          markers:
            headerResize || onDivider
              ? []
              : slots.map((t) => ({ x: t.anchor.x, y: t.anchor.y, active: false })),
        },
      }
      setDrag(update(d, p.x, p.y))
    },
    [layout, toPoster, divider, headerResizable, headerEl, elementAt, elements, slots, state, w, h, update],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const p = toPoster(e)
      if (!p || !layout) return
      if (!drag) {
        if (divider !== null && Math.abs(p.y - divider) <= EDGE_GRAB) {
          setHover('row-resize')
          return
        }
        if (headerResizable && headerEl && headerEdgeAt(headerEl, p.x, p.y)) {
          setHover('col-resize')
          return
        }
        setHover(elementAt(p.x, p.y) ? 'grab' : null)
        return
      }
      const moved = drag.moved || Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD
      setDrag(update({ ...drag, moved }, p.x, p.y))
    },
    [drag, layout, toPoster, divider, headerResizable, headerEl, elementAt, update],
  )

  // Commit outside the `setDrag` updater: React runs updater functions during the
  // render phase, and a store write from there updates other components mid-render.
  const finish = useCallback(
    (commit: boolean) => {
      const d = drag
      setDrag(null)
      if (d && commit && d.moved) {
        if (d.dividerDrag) {
          if (d.ratio !== null) setMany({ splitRatio: d.ratio }, 'preset:split-resize')
        } else if (d.headerResize) {
          if (d.cols !== null) {
            setMany(
              layout === 'centered'
                ? { centeredHeaderCols: d.cols }
                : { editorialHeaderCols: d.cols },
              'preset:header-resize',
            )
          }
        } else if (d.slot) {
          setGenSlot(d.key, d.slot)
        }
      }
    },
    [drag, setGenSlot, setMany, layout],
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

  return {
    overlay: drag && drag.moved ? drag.overlay : null,
    cursor: drag
      ? drag.dividerDrag
        ? 'row-resize'
        : drag.headerResize
          ? 'col-resize'
          : 'grabbing'
      : (hover ?? 'default'),
    handlers: layout
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave }
      : {},
  }
}
