import { GRID_COLUMNS } from '../config/constants'

/**
 * 10-column grid with NO margin and NO gutter. All helpers take the live poster
 * dimensions so layouts adapt to any aspect ratio.
 */
export function grid(w: number, h: number) {
  const colW = w / GRID_COLUMNS
  return {
    w,
    h,
    colW,
    /** Left x of column index `c` (0-based). */
    colX: (c: number) => c * colW,
    /** Width spanning `n` columns. */
    span: (n: number) => n * colW,
    /** The centered middle-8-of-10 band: x and width. */
    middle8: { x: colW, width: colW * 8 },
    /** Full-bleed width. */
    full: { x: 0, width: w },
    /** Horizontal split line (poster divided into top/bottom halves). */
    halfY: h / 2,
  }
}

export type Grid = ReturnType<typeof grid>
