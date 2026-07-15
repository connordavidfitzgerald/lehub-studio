import type { PaperPreset } from "../types";

import paper1 from "../assets/papers/paper1.png";
import paper2 from "../assets/papers/paper2.png";
import paper3 from "../assets/papers/paper3.png";
/**
 * Paper-texture presets. Drop texture images into src/assets/papers/ and import
 * them here (e.g. `import kraft from '../assets/papers/kraft.jpg'`), then set
 * `src`. The first entry is "None".
 */
export const PAPERS: PaperPreset[] = [
  {
    id: "none",
    label: "None",
    src: null,
    blend: "source-over",
    defaultOpacity: 0,
  },
  {
    id: "paper1",
    label: "1",
    src: paper1,
    blend: "screen",
    defaultOpacity: 1,
  },
  {
    id: "paper2",
    label: "2",
    src: paper2,
    blend: "soft-light",
    defaultOpacity: 0.5,
  },
  {
    id: "paper3",
    label: "3",
    src: paper3,
    blend: "soft-light",
    defaultOpacity: 1,
  },
  // Example once you add textures:
  // { id: 'kraft', label: 'Kraft', src: kraft, blend: 'multiply', defaultOpacity: 0.5 },
  // { id: 'newsprint', label: 'Newsprint', src: newsprint, blend: 'multiply', defaultOpacity: 0.35 },
];

export const getPaper = (id: string): PaperPreset =>
  PAPERS.find((p) => p.id === id) ?? PAPERS[0];
