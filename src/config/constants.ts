import type { Aspect, HalftoneParams } from "../types";
import logo from "../assets/logo.webp";

/** The fixed brand pink — used ONLY for the notched header outline stroke. */
export const OUTLINE_COLOR = "#FF669E";

/** All glyph fills (header, secondary, category) are black at 60% opacity. */
export const TEXT_COLOR = "rgba(0, 0, 0, 0.55)";

/**
 * Padding around every fitted text background (header + secondary + category),
 * as a fraction of the poster's short edge — ~2px on all sides at the 1080 base.
 */
export const PAD_RATIO = 5 / 1080;

/** Default letter-spacing for secondary text, as a fraction of its font size (negative = tighter). */
export const SECONDARY_TRACKING = -0.03;

/**
 * Vertical gap between stacked secondary-text lines, as a fraction of the
 * font size. 0 = lines packed flush (boxes touching); increase to loosen.
 */
export const SECONDARY_LINE_GAP = -0.12;

/** Line advance within an editorial paragraph, as a multiple of the font size (1 = 100%). */
export const PARAGRAPH_LINE_HEIGHT = 1;

/** Max number of paragraph containers in the editorial layout. */
export const MAX_PARAGRAPHS = 4;

/**
 * Modular type scale. Every text size is a step on one geometric ladder
 * (BASE × RATIO^n, as a fraction of the short edge) so the elements stay in
 * proportion instead of using hand-picked decimals.
 *   step 0 → body/secondary + logo · step 1 → category/label
 *   step 2 → small subhead · step 4 → medium subhead
 */
export const TYPE_BASE = 0.035;
export const TYPE_RATIO = 1.25;
export const typeStep = (n: number): number => TYPE_BASE * TYPE_RATIO ** n;

/**
 * Fitted-header ceiling as a fraction of the short edge. Width-fitted headers
 * (split/centered/generative/editorial-full) never grow past this, so a short
 * headline can't balloon out of scale with the rest of the type.
 */
export const HEADER_MAX_RATIO = 0.2;

/** Editorial fixed header sizes, as steps on the type scale (medium is the default). */
export const EDITORIAL_HEADER_SIZES: Record<"small" | "medium", number> = {
  small: typeStep(2),
  medium: typeStep(4),
};

/**
 * Base poster resolution. All layout math is expressed against the true pixel
 * dimensions below, so everything is resolution-independent.
 */
export const ASPECTS: Aspect[] = [
  { id: "4x5", label: "Post", w: 1080, h: 1350 },
  { id: "9x16", label: "Story", w: 1080, h: 1920 },
  { id: "5x7", label: "Email", w: 1080, h: 1512 },
];

export const EXPORT_SCALES = [1, 2] as const;

/** Opacity (0..1) seeded when a paper texture is first toggled on. */
export const DEFAULT_PAPER_OPACITY = 0.4;

/** Logo/secondary sizes are CONSTANT across layouts — steps on the type scale. */
export const LOGO_HEIGHT_RATIO = typeStep(0); // same tier as the secondary text
export const SECONDARY_SIZE_RATIO = typeStep(0);
export const CATEGORY_SIZE_RATIO = typeStep(1);

/** Grid: 10 columns, no margin, no gutter. */
export const GRID_COLUMNS = 10;

/** Brand logo. `src` is the bundled image URL; `fallbackText` renders if it fails to load. */
export const LOGO = {
  src: logo as string,
  fallbackText: "◆ STUDIO",
};

export const DEFAULT_HALFTONE: HalftoneParams = {
  dotScale: 3,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  shadows: 0,
  highlights: 0,
  angleC: 75,
  angleM: 45,
  angleY: 15,
  angleK: 0,
  sharpness: 0.75,
};
