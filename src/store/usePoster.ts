import { create } from 'zustand'
import type {
  AspectId,
  GenElementKey,
  GenSlot,
  HalftoneParams,
  HeaderWidthMode,
  LayoutId,
  Paragraph,
  PosterState,
  SlideType,
} from '../types'
import { DEFAULT_HALFTONE } from '../config/constants'
import { loadImageRef, pruneImageBlobs, type ImageRef } from './imageStore'
import { PAPERS } from '../config/papers'
import { CATEGORY_PRESETS } from '../config/categoryPresets'
import {
  extractStyle,
  loadPresets,
  loadSession,
  savePresets,
  saveSession,
  type Preset,
} from './presets'

// Every real paper texture (excludes the "None" entry) — all on by default, each
// seeded at its own default opacity.
const REAL_PAPERS = PAPERS.filter((p) => p.src)
const DEFAULT_PAPER_IDS = REAL_PAPERS.map((p) => p.id)
const DEFAULT_PAPER_OPACITIES = Object.fromEntries(
  REAL_PAPERS.map((p) => [p.id, p.defaultOpacity]),
)

/** A fresh secondary element with sensible per-element defaults. */
export function makeParagraph(text = ''): Paragraph {
  return { text, side: 'left', half: 'top', position: 'top-right', style: 'fitted' }
}

/** Category shown on a fresh artboard / initial load. */
export const DEFAULT_CATEGORY = 'information'

/** Text/category/image fields for a category preset (shared by defaults + applyCategory). */
function categoryFields(id: string, image: HTMLImageElement | null) {
  const preset = CATEGORY_PRESETS[id]
  const secs = preset.secondaries
  const paragraphs = secs.length ? secs.map((t) => makeParagraph(t)) : [makeParagraph()]
  // Split layout: default the 2nd secondary to the bottom half's top-left corner so
  // the two blocks land in opposite halves out of the box.
  if (paragraphs[1]) {
    paragraphs[1] = { ...paragraphs[1], half: 'bottom', position: 'top-left' }
  }
  return {
    paletteId: id,
    categoryId: id,
    category: preset.category,
    header: preset.header,
    paragraphs,
    image,
    // The placeholder is a bundled asset, so its URL is all we need to get it back
    // after a reload — even if the element itself hasn't finished loading yet.
    imageRef: preset.image ? ({ kind: 'url', src: preset.image } as ImageRef) : null,
  }
}

// --- Slot plumbing. A pin lives with the thing it moves: header, category and
//     logo on the poster state, secondaries on their paragraph. The generative
//     layout and the preset layouts keep separate pins — their compositions have
//     nothing in common, so a drag in one must not rearrange the other. ---

const SLOT_FIELD = {
  header: 'genHeaderSlot',
  category: 'genCategorySlot',
  logo: 'genLogoSlot',
} as const

const PRESET_SLOT_FIELD = {
  header: 'presetHeaderSlot',
  category: 'presetCategorySlot',
  logo: 'presetLogoSlot',
} as const

/** Which set of pin fields this poster's layout writes to. */
const fieldsFor = (s: PosterState) =>
  s.layout === 'generative' ? SLOT_FIELD : PRESET_SLOT_FIELD

const paraFieldFor = (s: PosterState) =>
  s.layout === 'generative' ? ('genSlot' as const) : ('presetSlot' as const)

/** Every element that can currently hold a pin, in a stable order. */
function slotKeys(s: PosterState): GenElementKey[] {
  return [
    'header',
    'category',
    'logo',
    ...s.paragraphs.map((_, i): GenElementKey => `p${i}`),
  ]
}

function readSlot(s: PosterState, key: GenElementKey): GenSlot | null {
  if (key === 'image') return null
  const fields = fieldsFor(s)
  if (key in fields) return s[fields[key as keyof typeof fields]] ?? null
  const i = Number(key.slice(1))
  return s.paragraphs[i]?.[paraFieldFor(s)] ?? null
}

function writeSlot(s: PosterState, key: GenElementKey, slot: GenSlot | null): PosterState {
  if (key === 'image') return s
  const fields = fieldsFor(s)
  if (key in fields) return { ...s, [fields[key as keyof typeof fields]]: slot }
  const i = Number(key.slice(1))
  if (!s.paragraphs[i]) return s
  const field = paraFieldFor(s)
  return {
    ...s,
    paragraphs: s.paragraphs.map((p, idx) => (idx === i ? { ...p, [field]: slot } : p)),
  }
}

const sameCell = (a: GenSlot | null, b: GenSlot) =>
  !!a && a.region === b.region && a.v === b.v && a.h === b.h

/**
 * Drop every manual adjustment — pins and the dragged image size — returning the
 * poster to its purely seeded composition.
 */
function clearSlots(s: PosterState): PosterState {
  if (s.layout !== 'generative') {
    return {
      ...s,
      editorialHeaderCols: null,
      centeredHeaderCols: null,
      splitRatio: null,
      presetHeaderSlot: null,
      presetCategorySlot: null,
      presetLogoSlot: null,
      paragraphs: s.paragraphs.map((p) => (p.presetSlot ? { ...p, presetSlot: null } : p)),
    }
  }
  return {
    ...s,
    genImageSize: null,
    genImageAxis: null,
    genHeaderCols: null,
    genHeaderSlot: null,
    genCategorySlot: null,
    genLogoSlot: null,
    paragraphs: s.paragraphs.map((p) => (p.genSlot ? { ...p, genSlot: null } : p)),
  }
}

/**
 * Pin `key` to `slot` (or release it with `null`), renumbering the target cell so
 * `order` stays a dense 0..n-1 sequence with the dropped element at the requested
 * index. Pure, so the drag preview can plan against the exact state a drop would
 * produce instead of guessing where the element will land.
 */
export function applyGenSlot(
  s: PosterState,
  key: GenElementKey,
  slot: GenSlot | null,
): PosterState {
  const next = writeSlot(s, key, slot)
  if (!slot) return next
  const others = slotKeys(next)
    .filter((k) => k !== key && sameCell(readSlot(next, k), slot))
    .sort((a, b) => readSlot(next, a)!.order - readSlot(next, b)!.order)
  others.splice(Math.max(0, Math.min(slot.order, others.length)), 0, key)
  return others.reduce((acc, k, i) => writeSlot(acc, k, { ...readSlot(acc, k)!, order: i }), next)
}

/** True when anything on this poster has been dragged out of its layout's flow. */
export function hasGenSlots(s: PosterState): boolean {
  if (s.layout !== 'generative') {
    return (
      s.editorialHeaderCols != null ||
      s.centeredHeaderCols != null ||
      s.splitRatio != null ||
      !!s.presetHeaderSlot ||
      !!s.presetCategorySlot ||
      !!s.presetLogoSlot ||
      s.paragraphs.some((p) => p.presetSlot)
    )
  }
  return (
    s.genImageSize != null ||
    s.genHeaderCols != null ||
    !!s.genHeaderSlot ||
    !!s.genCategorySlot ||
    !!s.genLogoSlot ||
    s.paragraphs.some((p) => p.genSlot)
  )
}

/** One editable poster. Each artboard owns an independent `PosterState`. */
export interface Artboard {
  id: string
  state: PosterState
}

// --- Undo/redo. Every action rebuilds state instead of mutating it, so a history
//     entry is just a reference to the previous artboards array — snapshots cost
//     nothing to take and share all their untouched structure. ---

/** How much of the store undo restores: the posters and which one was open. */
export interface Snapshot {
  artboards: Artboard[]
  currentId: string
}

const HISTORY_LIMIT = 50

/**
 * Runs of the same action within this window collapse into one undo step, so a
 * typed headline or a dragged slider undoes as a single edit rather than
 * per keystroke / per pixel.
 */
const COALESCE_MS = 500

/**
 * What kind of edit is being made, set by each action just before it runs. Two
 * consecutive edits sharing a tag (within {@link COALESCE_MS}) are one undo step.
 * `null` means "don't record this at all" — used for changes the user didn't
 * make, like an image finishing loading.
 */
let pendingTag: string | null = null
const tag = (t: string | null) => {
  pendingTag = t
}
let lastTag: string | null = null
let lastAt = 0
/** Set while undo/redo is applying, so restoring a snapshot isn't itself recorded. */
let applyingHistory = false

/** Run an action, labelling whatever it changes for the history recorder. */
function tagged<T>(t: string | null, run: () => T): T {
  tag(t)
  return run()
}

interface PosterStore {
  artboards: Artboard[]
  currentId: string
  /** Saved style presets (localStorage-backed). */
  presets: Preset[]
  /** Snapshots behind and ahead of the current state (undo / redo stacks). */
  past: Snapshot[]
  future: Snapshot[]

  /** Step back to the state before the last edit. */
  undo: () => void
  /** Step forward again after an undo. */
  redo: () => void

  set: <K extends keyof PosterState>(key: K, value: PosterState[K]) => void
  /**
   * Set several fields as one edit, so a gesture that moves more than one field
   * (resizing the generative image sets its axis, side and size together) costs
   * a single undo step rather than one per field.
   */
  setMany: (fields: Partial<PosterState>, tag?: string) => void
  setHalftone: <K extends keyof HalftoneParams>(
    key: K,
    value: HalftoneParams[K],
  ) => void
  /** Set the current artboard's image, along with how to restore it on reload. */
  setImage: (img: HTMLImageElement | null, ref?: ImageRef | null) => void
  /** Attach a loaded image to one artboard, leaving its stored reference alone. */
  setArtboardImage: (artboardId: string, img: HTMLImageElement) => void
  /** Generative layout: pin (or unpin, with `null`) one element to a slot. */
  setGenSlot: (key: GenElementKey, slot: GenSlot | null) => void
  /** Generative layout: release every manually dragged element back to the seed. */
  clearGenSlots: () => void
  /** Select a category and apply its placeholder content (text + image + layout). */
  applyCategory: (id: string, image: HTMLImageElement | null) => void
  setPaperOpacity: (id: string, value: number) => void

  addArtboard: () => void
  duplicateArtboard: (id: string) => void
  removeArtboard: (id: string) => void
  selectArtboard: (id: string) => void
  /** Move `fromId` so it takes the slot currently held by `toId`. */
  reorderArtboard: (fromId: string, toId: string) => void
  /** Change the current artboard's layout. */
  setLayout: (layout: LayoutId) => void
  /** Switch the current artboard to the generative layout with a fresh seed. */
  generateLayout: (slideType?: SlideType) => void

  /** Save the current artboard's look as a named preset. */
  savePreset: (name: string) => void
  /** Apply a preset's look to the current artboard, leaving its text alone. */
  applyPreset: (id: string) => void
  deletePreset: (id: string) => void
}

let seq = 0
const uid = () => `ab_${Date.now().toString(36)}_${(seq++).toString(36)}`

/** A fresh poster, pre-filled with the default category's placeholder content. */
function createDefaultState(): PosterState {
  const preset = CATEGORY_PRESETS[DEFAULT_CATEGORY]
  return {
    aspect: '4x5' as AspectId,
    layout: (preset.layout ?? 'split') as LayoutId,
    textHalf: 'top',
    headerWidth: 'cols8' as HeaderWidthMode,
    centeredLabelPos: 'top',

    paperIds: [...DEFAULT_PAPER_IDS],
    paperOpacities: { ...DEFAULT_PAPER_OPACITIES },

    // Category label, header, secondary paragraphs (image loaded on mount).
    ...categoryFields(DEFAULT_CATEGORY, null),

    bgMode: 'solid',
    editorialHeaderAlign: 'left',
    editorialHeaderSize: 'medium',
    seed: 1,
    slideType: 'main',
    genAlign: 'auto',
    genHeaderWidth: 'auto',
    genImageAlign: 'auto',
    genImageSize: null,
    genHeaderCols: null,
    genHeaderSlot: null,
    genCategorySlot: null,
    genLogoSlot: null,

    halftone: { ...DEFAULT_HALFTONE },
  }
}

/** Return a new artboards array with `updater` applied to the current one. */
function mapCurrent(
  store: PosterStore,
  updater: (s: PosterState) => PosterState,
): Artboard[] {
  return store.artboards.map((a) =>
    a.id === store.currentId ? { ...a, state: updater(a.state) } : a,
  )
}

/**
 * Rebuild the artboards from a stored session. Each state is spread over a fresh
 * default so a session saved before a field existed still loads (it just picks up
 * that field's default). Images can't be stored, so they come back empty.
 */
function restoreArtboards(): { artboards: Artboard[]; currentId: string } | null {
  const stored = loadSession()
  if (!stored) return null
  const artboards = stored.artboards.map(({ id, state }) => ({
    id,
    state: { ...createDefaultState(), ...state, image: null } as PosterState,
  }))
  const currentId = artboards.some((a) => a.id === stored.currentId)
    ? stored.currentId
    : artboards[0].id
  return { artboards, currentId }
}

const restored = restoreArtboards()
/** True when this session came back from localStorage rather than starting fresh. */
export const sessionRestored = restored !== null

const initial = restored ?? (() => {
  const board: Artboard = { id: uid(), state: createDefaultState() }
  return { artboards: [board], currentId: board.id }
})()

export const usePoster = create<PosterStore>((set) => ({
  artboards: initial.artboards,
  currentId: initial.currentId,
  presets: loadPresets(),
  past: [],
  future: [],

  undo: () =>
    set((store) => {
      const prev = store.past.at(-1)
      if (!prev) return {}
      applyingHistory = true
      // Any run being coalesced ends here, so the next edit starts a fresh step.
      lastTag = null
      return {
        past: store.past.slice(0, -1),
        future: [...store.future, { artboards: store.artboards, currentId: store.currentId }],
        artboards: prev.artboards,
        currentId: prev.currentId,
      }
    }),

  redo: () =>
    set((store) => {
      const next = store.future.at(-1)
      if (!next) return {}
      applyingHistory = true
      lastTag = null
      return {
        future: store.future.slice(0, -1),
        past: [...store.past, { artboards: store.artboards, currentId: store.currentId }],
        artboards: next.artboards,
        currentId: next.currentId,
      }
    }),

  set: (key, value) =>
    // Edits to the same field in quick succession (typing, dragging a slider)
    // collapse into one undo step.
    tagged(`set:${String(key)}`, () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => ({ ...s, [key]: value })),
      })),
    ),

  setMany: (fields, tagName) =>
    tagged(tagName ?? `set:${Object.keys(fields).sort().join(',')}`, () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => ({ ...s, ...fields })),
      })),
    ),

  setHalftone: (key, value) =>
    tagged(`halftone:${String(key)}`, () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => ({
          ...s,
          halftone: { ...s.halftone, [key]: value },
        })),
      })),
    ),

  setImage: (img, ref = null) =>
    tagged('image', () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => ({ ...s, image: img, imageRef: ref })),
      })),
    ),

  // Not an edit: an image the user already chose finished loading. Recording it
  // would make Cmd+Z "undo" the image appearing after a refresh.
  setArtboardImage: (artboardId, img) =>
    tagged(null, () =>
      set((store) => ({
        artboards: store.artboards.map((a) =>
          a.id === artboardId ? { ...a, state: { ...a.state, image: img } } : a,
        ),
      })),
    ),

  setGenSlot: (key, slot) =>
    tagged(`genSlot:${key}`, () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => applyGenSlot(s, key, slot)),
      })),
    ),

  clearGenSlots: () =>
    tagged('clearGenSlots', () =>
      set((store) => ({
        artboards: mapCurrent(store, clearSlots),
      })),
    ),

  applyCategory: (id, image) =>
    tagged('applyCategory', () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => {
          const preset = CATEGORY_PRESETS[id]
          if (!preset) return { ...s, paletteId: id, categoryId: id }
          return { ...s, ...categoryFields(id, image), layout: preset.layout ?? s.layout }
        }),
      })),
    ),

  setPaperOpacity: (id, value) =>
    tagged(`paper:${id}`, () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => ({
          ...s,
          paperOpacities: { ...s.paperOpacities, [id]: value },
        })),
      })),
    ),

  addArtboard: () =>
    tagged('addArtboard', () =>
      set((store) => {
        const board: Artboard = { id: uid(), state: createDefaultState() }
        return { artboards: [...store.artboards, board], currentId: board.id }
      }),
    ),

  duplicateArtboard: (id) =>
    tagged('duplicateArtboard', () =>
    set((store) => {
      const src = store.artboards.find((a) => a.id === id)
      if (!src) return {}
      // Shallow-clone state; `image` (an HTMLImageElement) is shared by reference.
      const board: Artboard = {
        id: uid(),
        state: {
          ...src.state,
          paperIds: [...src.state.paperIds],
          paperOpacities: { ...src.state.paperOpacities },
          paragraphs: src.state.paragraphs.map((p) => ({ ...p })),
          halftone: { ...src.state.halftone },
        },
      }
      const idx = store.artboards.findIndex((a) => a.id === id)
      const artboards = [...store.artboards]
      artboards.splice(idx + 1, 0, board)
      return { artboards, currentId: board.id }
    }),
    ),

  removeArtboard: (id) =>
    tagged('removeArtboard', () =>
      set((store) => {
        if (store.artboards.length <= 1) return {} // never delete the last one
        const idx = store.artboards.findIndex((a) => a.id === id)
        const artboards = store.artboards.filter((a) => a.id !== id)
        let currentId = store.currentId
        if (currentId === id) {
          const next = artboards[Math.min(idx, artboards.length - 1)]
          currentId = next.id
        }
        return { artboards, currentId }
      }),
    ),

  // Switching artboards isn't an edit, so it doesn't get its own undo step — but
  // snapshots carry the selection, so undoing an edit returns to the board it
  // happened on.
  selectArtboard: (id) => tagged(null, () => set({ currentId: id })),

  reorderArtboard: (fromId, toId) =>
    tagged('reorderArtboard', () =>
      set((store) => {
        if (fromId === toId) return {}
        const from = store.artboards.findIndex((a) => a.id === fromId)
        const to = store.artboards.findIndex((a) => a.id === toId)
        if (from < 0 || to < 0) return {}
        const artboards = [...store.artboards]
        const [moved] = artboards.splice(from, 1)
        artboards.splice(to, 0, moved)
        return { artboards }
      }),
    ),

  setLayout: (layout) =>
    tagged('setLayout', () =>
      set((store) => ({
        artboards: mapCurrent(store, (s) => ({ ...s, layout })),
      })),
    ),

  generateLayout: (slideType) =>
    tagged('generateLayout', () =>
      set((store) => ({
        // A new seed is a new composition, so pins from the old one are dropped.
        artboards: mapCurrent(store, (s) => ({
          ...clearSlots(s),
          layout: 'generative',
          slideType: slideType ?? s.slideType,
          seed: (Math.random() * 2 ** 31) >>> 0,
        })),
      })),
    ),

  savePreset: (name) =>
    set((store) => {
      const trimmed = name.trim()
      if (!trimmed) return {}
      const cur = store.artboards.find((a) => a.id === store.currentId)
      if (!cur) return {}
      const style = extractStyle(cur.state)
      // Re-saving under an existing name overwrites it rather than duplicating.
      const existing = store.presets.find((p) => p.name === trimmed)
      const presets = existing
        ? store.presets.map((p) => (p.id === existing.id ? { ...p, style } : p))
        : [...store.presets, { id: uid(), name: trimmed, style }]
      savePresets(presets)
      return { presets }
    }),

  applyPreset: (id) =>
    tagged('applyPreset', () =>
    set((store) => {
      const preset = store.presets.find((p) => p.id === id)
      if (!preset) return {}
      return {
        // Style only — header, category, paragraphs, image and seed stay put.
        artboards: mapCurrent(store, (s) => ({
          ...s,
          ...preset.style,
          paperIds: [...preset.style.paperIds],
          paperOpacities: { ...preset.style.paperOpacities },
          halftone: { ...preset.style.halftone },
        })),
      }
    }),
    ),

  deletePreset: (id) =>
    set((store) => {
      const presets = store.presets.filter((p) => p.id !== id)
      savePresets(presets)
      return { presets }
    }),
}))

// Persist the artboards on change, debounced so slider drags and typing don't
// thrash localStorage. Images are dropped by saveSession — they can't be stored.
let saveTimer: ReturnType<typeof setTimeout> | undefined
// Record history from the *previous* state, so an entry is exactly "what it
// looked like before this edit". Runs of the same tagged action inside the
// coalesce window extend the current step instead of adding another one.
usePoster.subscribe((store, prev) => {
  if (store.artboards === prev.artboards) {
    pendingTag = null
    return // selection-only changes aren't edits
  }
  if (applyingHistory) {
    applyingHistory = false
    pendingTag = null
    return
  }
  const t = pendingTag
  pendingTag = null
  if (t === null) return // not a user edit (e.g. an image finished loading)

  const now = Date.now()
  const coalesce = t === lastTag && now - lastAt < COALESCE_MS && store.past.length > 0
  lastTag = t
  lastAt = now
  if (coalesce) return // the step already covers this run

  const past = [...store.past, { artboards: prev.artboards, currentId: prev.currentId }]
  usePoster.setState({
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [], // a fresh edit invalidates anything that was undone
  })
})

usePoster.subscribe((store, prev) => {
  if (store.artboards === prev.artboards && store.currentId === prev.currentId) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(
    () => saveSession({ artboards: store.artboards, currentId: store.currentId }),
    400,
  )
})

// Images can't be serialized, so a restored session comes back with `imageRef`
// set but `image` empty. Loading is async and idempotent: each reference is
// fetched at most once, and stored uploads no artboard points at are dropped.
const loading = new Set<string>()
const refKey = (ref: ImageRef) => (ref.kind === 'url' ? `url:${ref.src}` : `blob:${ref.id}`)

let pruned = false

/** Reload the images every artboard references but hasn't got in memory. */
export async function hydrateImages(): Promise<void> {
  const { artboards } = usePoster.getState()
  const missing = artboards.filter((a) => a.state.imageRef && !a.state.image)
  // Called on every state change, so do nothing (and touch no storage) unless
  // there is an image to load or stale uploads still to sweep up.
  if (!missing.length && pruned) return
  await Promise.all(
    missing.map(async ({ id, state }) => {
      const ref = state.imageRef
      if (!ref || state.image) return
      const key = `${id}|${refKey(ref)}`
      if (loading.has(key)) return
      loading.add(key)
      const img = await loadImageRef(ref)
      loading.delete(key)
      // The artboard may have been deleted or re-imaged while we were loading.
      const current = usePoster.getState().artboards.find((a) => a.id === id)
      if (img && current && !current.state.image && current.state.imageRef === ref) {
        usePoster.getState().setArtboardImage(id, img)
      }
    }),
  )
  pruned = true
  await pruneImageBlobs(
    usePoster
      .getState()
      .artboards.map((a) => a.state.imageRef)
      .filter((r): r is ImageRef => !!r && r.kind === 'blob')
      .map((r) => (r as { id: string }).id),
  )
}

/** The current artboard's poster state (re-renders when it changes). */
export function useCurrentState(): PosterState {
  return usePoster((st) => {
    const ab = st.artboards.find((a) => a.id === st.currentId)
    return (ab ?? st.artboards[0]).state
  })
}
