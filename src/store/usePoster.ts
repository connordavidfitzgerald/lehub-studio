import { create } from 'zustand'
import type {
  AspectId,
  HalftoneParams,
  HeaderWidthMode,
  LayoutId,
  Paragraph,
  PosterState,
  SlideType,
} from '../types'
import { DEFAULT_HALFTONE } from '../config/constants'
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
  }
}

/** One editable poster. Each artboard owns an independent `PosterState`. */
export interface Artboard {
  id: string
  state: PosterState
}

interface PosterStore {
  artboards: Artboard[]
  currentId: string
  /** Saved style presets (localStorage-backed). */
  presets: Preset[]

  set: <K extends keyof PosterState>(key: K, value: PosterState[K]) => void
  setHalftone: <K extends keyof HalftoneParams>(
    key: K,
    value: HalftoneParams[K],
  ) => void
  setImage: (img: HTMLImageElement | null) => void
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

  set: (key, value) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => ({ ...s, [key]: value })),
    })),

  setHalftone: (key, value) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => ({
        ...s,
        halftone: { ...s.halftone, [key]: value },
      })),
    })),

  setImage: (img) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => ({ ...s, image: img })),
    })),

  applyCategory: (id, image) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => {
        const preset = CATEGORY_PRESETS[id]
        if (!preset) return { ...s, paletteId: id, categoryId: id }
        return { ...s, ...categoryFields(id, image), layout: preset.layout ?? s.layout }
      }),
    })),

  setPaperOpacity: (id, value) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => ({
        ...s,
        paperOpacities: { ...s.paperOpacities, [id]: value },
      })),
    })),

  addArtboard: () =>
    set((store) => {
      const board: Artboard = { id: uid(), state: createDefaultState() }
      return { artboards: [...store.artboards, board], currentId: board.id }
    }),

  duplicateArtboard: (id) =>
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

  removeArtboard: (id) =>
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

  selectArtboard: (id) => set({ currentId: id }),

  reorderArtboard: (fromId, toId) =>
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

  setLayout: (layout) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => ({ ...s, layout })),
    })),

  generateLayout: (slideType) =>
    set((store) => ({
      artboards: mapCurrent(store, (s) => ({
        ...s,
        layout: 'generative',
        slideType: slideType ?? s.slideType,
        seed: (Math.random() * 2 ** 31) >>> 0,
      })),
    })),

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
usePoster.subscribe((store, prev) => {
  if (store.artboards === prev.artboards && store.currentId === prev.currentId) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(
    () => saveSession({ artboards: store.artboards, currentId: store.currentId }),
    400,
  )
})

/** The current artboard's poster state (re-renders when it changes). */
export function useCurrentState(): PosterState {
  return usePoster((st) => {
    const ab = st.artboards.find((a) => a.id === st.currentId)
    return (ab ?? st.artboards[0]).state
  })
}
