import type { ImageRef } from './store/imageStore'

export type AspectId = '4x5' | '9x16' | '5x7'

export interface Aspect {
  id: AspectId
  label: string
  w: number
  h: number
}

export interface Palette {
  id: string
  label: string
  /** Poster background fill */
  background: string
  /** Background behind secondary info (date/time etc.) */
  secondaryBg: string
  /** Background behind the category label (top-left) */
  highlight: string
}

export interface PaperPreset {
  id: string
  label: string
  /** null = "None". Otherwise a URL/import to the texture image. */
  src: string | null
  blend: GlobalCompositeOperation
  defaultOpacity: number
}

export interface HalftoneParams {
  /** Halftone cell size in poster pixels (dot pitch). */
  dotScale: number
  contrast: number
  brightness: number
  saturation: number
  /** Lift (+) or deepen (-) the dark tones. Range -1..1, 0 = neutral. */
  shadows: number
  /** Brighten (+) or recover (-) the bright tones. Range -1..1, 0 = neutral. */
  highlights: number
  /** Screen angles in degrees for C, M, Y, K. */
  angleC: number
  angleM: number
  angleY: number
  angleK: number
  /** Dot edge softness (0 = crisp, higher = softer). */
  sharpness: number
}

export type LayoutId = 'split' | 'centered' | 'editorial' | 'generative'
export type HalfPosition = 'top' | 'bottom'
export type HeaderWidthMode = 'cols8' | 'full'
/** Centered layout: category label pinned to the canvas top-centre, or stacked above the text. */
export type CenteredLabelPos = 'top' | 'above'

/** Generative layout: main slide (pink header) vs secondary slide (secondary-colour header). */
export type SlideType = 'main' | 'secondary'
/** Horizontal alignment (header + editorial/generative secondary). */
export type TextAlign = 'left' | 'center' | 'right'
/** Generative alignment: a fixed alignment, or `auto` for a seeded per-element scheme. */
export type GenAlign = TextAlign | 'auto'
/** Secondary rendering: badges fitted per line, or fixed-width paragraph blocks. */
export type SecondaryStyle = 'fitted' | 'paragraph'
/** Generative header width: auto (procedural) or a fixed column span. */
export type GenHeaderWidth = 'auto' | 'narrow' | 'wide' | 'full'
/**
 * Generative image band position. Moves the image region within the poster; the
 * text zone reflows into the space left over. Axis-neutral because the seeded band
 * decides the axis — `start` reads as top for a band across the poster and as left
 * for one down a side. `auto` keeps the seeded position. The band always hugs an
 * edge: a centred band would strand a dead half of the canvas behind it.
 */
export type GenImageAlign = 'auto' | 'start' | 'end'

/**
 * Generative layout: a manually pinned position. Elements snap to a 3×3 anchor
 * grid inside a region — the text zone, or the image region when an image is
 * present. Several elements can share a cell; `order` stacks them within it.
 */
export type GenSlotRegion = 'text' | 'image'
export type GenSlotV = 'top' | 'middle' | 'bottom'
export type GenSlotH = 'left' | 'center' | 'right'
export interface GenSlot {
  region: GenSlotRegion
  v: GenSlotV
  h: GenSlotH
  order: number
}
/** Identifies one draggable generative element; secondaries by paragraph index. */
export type GenElementKey = 'image' | 'category' | 'header' | 'logo' | `p${number}`

/** Editorial layout: how a paragraph container aligns horizontally. */
export type ContainerSide = 'left' | 'center' | 'right'
/** Editorial background: solid palette colour or the (halftoned) uploaded image. */
export type BgMode = 'solid' | 'image'
/** Editorial header size: fixed subheader sizes, or `full` (fit to width). */
export type EditorialHeaderSize = 'small' | 'medium' | 'full'

/** Split layout: which corner of the chosen half a secondary element sits in. */
export type SecondaryPos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/**
 * One secondary-text element, shared by every layout. `style` picks fitted vs
 * paragraph rendering; `side` is its alignment (editorial/centered/generative);
 * `half` + `position` place it in a corner of the top/bottom half (split only).
 */
export interface Paragraph {
  text: string
  side: ContainerSide
  half: HalfPosition
  position: SecondaryPos
  style: SecondaryStyle
  /** Generative layout: pinned position from dragging it on the canvas. */
  genSlot?: GenSlot | null
}

export interface PosterState {
  aspect: AspectId
  layout: LayoutId
  /** In split layout: which half holds the text block. */
  textHalf: HalfPosition
  /** In centered layout: header spans middle-8-cols or full width. */
  headerWidth: HeaderWidthMode
  /** In centered layout: category label at the canvas top-centre, or above the text stack. */
  centeredLabelPos: CenteredLabelPos

  categoryId: string
  paletteId: string
  /** Active paper textures, layered in order. Empty = none. */
  paperIds: string[]
  /** Per-paper opacity (0..1), keyed by paper id. */
  paperOpacities: Record<string, number>

  /** Header (headline) text — rendered all-caps with the notched outline. */
  header: string
  /** Category label shown top-left. */
  category: string
  /** Secondary-text elements (shared by every layout). */
  paragraphs: Paragraph[]
  /** Editorial layout: background is a solid palette colour or the uploaded image. */
  bgMode: BgMode
  /** Editorial layout: header horizontal alignment. */
  editorialHeaderAlign: TextAlign
  /** Editorial layout: header size (constant subheader sizes, or fit-to-width). */
  editorialHeaderSize: EditorialHeaderSize
  /** Generative layout: RNG seed that determines the procedural arrangement. */
  seed: number
  /** Generative layout: main slide (pink header) or secondary slide (secondary colour). */
  slideType: SlideType
  /** Generative layout: horizontal alignment of the text block (`auto` = seeded scheme). */
  genAlign: GenAlign
  /** Generative layout: header column span (auto = procedural). */
  genHeaderWidth: GenHeaderWidth
  /**
   * Generative layout: explicit header span in grid columns, from dragging the
   * header's free edge. Overrides `genHeaderWidth`; `null`/absent defers to it.
   */
  genHeaderCols?: number | null
  /** Generative layout: where the image band sits (`auto` = seeded position). */
  genImageAlign: GenImageAlign
  /**
   * Generative layout: image band size in grid units (tenths of the axis it
   * spans), from dragging its inner edge. `null`/absent keeps the seeded size.
   * Sized past the point where the text would be squeezed below its minimum, the
   * image fills the canvas and the text sits over it.
   */
  genImageSize?: number | null
  /** Generative layout: pinned positions from dragging elements on the canvas. */
  genHeaderSlot?: GenSlot | null
  genCategorySlot?: GenSlot | null
  genLogoSlot?: GenSlot | null

  image: HTMLImageElement | null
  /**
   * Where `image` came from, so it can be restored after a reload — the element
   * itself has no JSON form. See `store/imageStore.ts`.
   */
  imageRef?: ImageRef | null
  halftone: HalftoneParams
}
