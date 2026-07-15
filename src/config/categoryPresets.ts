import type { LayoutId } from '../types'
import eventImg from '../assets/placeholders/event.png'
import infoImg from '../assets/placeholders/info.png'
import resourceImg from '../assets/placeholders/resource.png'

/**
 * Placeholder content applied when a category is selected. Populates the header,
 * category label, secondary text block(s) and background/foreground image, so
 * each category starts from its own template. Keyed by palette id.
 */
export interface CategoryPreset {
  /** Category label; '' hides the badge on the poster. */
  category: string
  /** Header text; `\n` marks line breaks. */
  header: string
  /** One or more secondary-text blocks. */
  secondaries: string[]
  /** Placeholder image (imported URL), or null for none. */
  image: string | null
  /** Optional layout to switch to when applied. */
  layout?: LayoutId
}

export const CATEGORY_PRESETS: Record<string, CategoryPreset> = {
  event: {
    category: 'Atelier',
    header: 'Vers une\napproche pratique\ndu consentment\ndans nos milieux\nmilitants',
    secondaries: ['6-7 septembre\n251 avenue des Pins'],
    image: eventImg,
  },
  information: {
    category: "Point d'info",
    header: 'Le projet de loi 97\net les blocages\nautochtones\nen cours',
    secondaries: ["l'extrait de notre wiki"],
    image: infoImg,
  },
  resources: {
    category: 'Ressource',
    header: 'Bibliothéque\nde ressources\nmilitantes',
    secondaries: [
      '3516 avenue du Parc',
      'Inscrivez-vous pour emprunter un système sonore, une cafetière ou plus pour votre prochain évènement.',
    ],
    image: resourceImg,
  },
  about: {
    category: '',
    header: 'Let this\nradicalize you\nrather than\nlead you\nto despair.',
    secondaries: ['Mariame Kaba'],
    image: null,
    layout: 'centered',
  },
}
