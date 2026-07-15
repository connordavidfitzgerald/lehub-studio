import type { Palette } from '../types'

/**
 * Colour palettes keyed by post category. EDIT THESE with the real brand values.
 * `background` = poster fill, `secondaryBg` = behind secondary info,
 * `highlight` = behind the category label. The header outline is always #FF669E
 * and all glyphs are black @ 60% (see constants.ts).
 *
 * Each category maps 1:1 to a palette here; add/rename freely.
 */
// One "secondary/highlight" colour per category drives both the secondary-info
// background and the category-label highlight.
export const PALETTES: Palette[] = [
  {
    id: 'event',
    label: 'Event',
    background: '#1FCC00',
    secondaryBg: '#FFEA4D',
    highlight: '#FFEA4D',
  },
  {
    id: 'information',
    label: 'Information',
    background: '#009CCC',
    secondaryBg: '#6BFF66',
    highlight: '#6BFF66',
  },
  {
    id: 'resources',
    label: 'Resources',
    background: '#CC7E00',
    secondaryBg: '#FF669E',
    highlight: '#FF669E',
  },
  {
    id: 'about',
    label: 'About',
    background: '#99CC00',
    secondaryBg: '#FF7F4D',
    highlight: '#FF7F4D',
  },
]

export const getPalette = (id: string): Palette =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0]
