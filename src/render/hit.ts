import type { Paragraph } from '../types'
import type { Bounds } from './elements'
import type { RenderEnv } from './env'

/**
 * Region taggers used by the layouts to report where each editable element landed.
 * Each returns an `onBounds` callback (or `undefined` when nothing is collecting,
 * e.g. on export) to hand straight to the matching draw primitive.
 */
export function tagHeader(env: RenderEnv): Bounds | undefined {
  const c = env.collect
  return c && ((x, y, w, h) => c({ target: { kind: 'header' }, x, y, w, h }))
}

export function tagCategory(env: RenderEnv): Bounds | undefined {
  const c = env.collect
  return c && ((x, y, w, h) => c({ target: { kind: 'category' }, x, y, w, h }))
}

/** Ties a region to a specific paragraph by its index in `state.paragraphs`. */
export function tagSecondary(env: RenderEnv, p: Paragraph): Bounds | undefined {
  const c = env.collect
  if (!c) return undefined
  const index = env.state.paragraphs.indexOf(p)
  return (x, y, w, h) => c({ target: { kind: 'secondary', index }, x, y, w, h })
}

export function collectImage(env: RenderEnv, x: number, y: number, w: number, h: number): void {
  env.collect?.({ target: { kind: 'image' }, x, y, w, h })
}
