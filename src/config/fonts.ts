/**
 * Brand fonts. The actual @font-face declarations live in src/index.css
 * (Review = header, Helvetica = secondary), with the .otf files in src/fonts/.
 * Here we just name the families and force-load them for the canvas.
 */
export interface BrandFont {
  /** CSS family name (must match the @font-face in index.css). */
  family: string
  weight: string
  /** Fallback stack used until (or if) the real font loads. */
  fallback: string
}

export const HEADER_FONT: BrandFont = {
  family: 'Review',
  weight: '700',
  fallback: '"Arial Narrow", "Helvetica Neue", sans-serif',
}

export const SECONDARY_FONT: BrandFont = {
  family: 'Helvetica',
  weight: '700',
  fallback: '"Helvetica Neue", Arial, sans-serif',
}

/** Build a canvas `font` string. The custom family wins when loaded. */
export const fontString = (font: BrandFont, sizePx: number): string =>
  `${font.weight} ${sizePx}px "${font.family}", ${font.fallback}`

/**
 * Force the brand fonts to download so they're available to canvas rendering.
 * `document.fonts.load` triggers the lazy @font-face fetch (canvas draws never
 * would on their own), then we await overall readiness.
 */
export async function loadFonts(): Promise<void> {
  await Promise.all(
    [HEADER_FONT, SECONDARY_FONT].map((f) =>
      document.fonts.load(`${f.weight} 64px "${f.family}"`),
    ),
  )
  await document.fonts.ready
}
