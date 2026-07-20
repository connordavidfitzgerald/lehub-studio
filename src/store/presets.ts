import type { PosterState } from '../types'

/**
 * The fields a style preset carries: the *look* only. Text content (header,
 * category, paragraphs), the uploaded image and the generative `seed` are
 * deliberately excluded, so applying a preset restyles the current poster
 * instead of replacing what's written on it.
 */
export const STYLE_KEYS = [
  'aspect',
  'layout',
  'paletteId',
  'bgMode',
  'textHalf',
  'headerWidth',
  'centeredLabelPos',
  'editorialHeaderAlign',
  'editorialHeaderSize',
  'slideType',
  'genAlign',
  'genHeaderWidth',
  'genImageAlign',
  'paperIds',
  'paperOpacities',
  'halftone',
] as const

export type StyleKey = (typeof STYLE_KEYS)[number]
export type PresetStyle = Pick<PosterState, StyleKey>

export interface Preset {
  id: string
  name: string
  style: PresetStyle
}

/** Copy just the style fields out of a poster, deep-copying the mutable ones. */
export function extractStyle(s: PosterState): PresetStyle {
  const out = {} as Record<string, unknown>
  for (const k of STYLE_KEYS) out[k] = s[k]
  return {
    ...(out as PresetStyle),
    paperIds: [...s.paperIds],
    paperOpacities: { ...s.paperOpacities },
    halftone: { ...s.halftone },
  }
}

// --- Storage. Both keys are versioned so a future shape change can be ignored
//     rather than crashing on stale data. ---

const PRESETS_KEY = 'poster.presets.v1'
const SESSION_KEY = 'poster.session.v1'

/** An artboard as stored: everything but the image, which can't be serialized. */
export type StoredState = Omit<PosterState, 'image'>
export interface StoredSession {
  artboards: { id: string; state: StoredState }[]
  currentId: string
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null // unavailable (private mode) or corrupt — fall back to defaults
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled: skip persisting rather than break the app.
  }
}

export function loadPresets(): Preset[] {
  const list = read<Preset[]>(PRESETS_KEY)
  if (!Array.isArray(list)) return []
  return list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.style)
}

export function savePresets(list: Preset[]): void {
  write(PRESETS_KEY, list)
}

export function loadSession(): StoredSession | null {
  const s = read<StoredSession>(SESSION_KEY)
  if (!s || !Array.isArray(s.artboards) || s.artboards.length === 0) return null
  if (!s.artboards.every((a) => a && typeof a.id === 'string' && a.state)) return null
  return s
}

export function saveSession(session: StoredSession): void {
  // Strip the image (an HTMLImageElement) — it has no JSON form.
  write(SESSION_KEY, {
    currentId: session.currentId,
    artboards: session.artboards.map(({ id, state }) => {
      const { image: _image, ...rest } = state as PosterState
      return { id, state: rest }
    }),
  })
}
