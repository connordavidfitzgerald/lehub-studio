import type { PaperPreset } from "../types";

import paper1 from "../assets/papers/paper1.webp";
import paper2 from "../assets/papers/paper2.webp";
import paper3 from "../assets/papers/paper3.webp";
import paper1Preview from "../assets/papers/paper1-preview.webp";
import paper2Preview from "../assets/papers/paper2-preview.webp";
import paper3Preview from "../assets/papers/paper3-preview.webp";
/**
 * Paper-texture presets. Drop texture images into src/assets/papers/ as PNG,
 * run `node scripts/optimize-assets.mjs` to emit the .webp + -preview.webp
 * pair, then import them here and set `src`/`previewSrc`. The first entry is
 * "None".
 */
export const PAPERS: PaperPreset[] = [
  {
    id: "none",
    label: "None",
    src: null,
    previewSrc: null,
    blend: "source-over",
    defaultOpacity: 0,
  },
  {
    id: "paper1",
    label: "1",
    src: paper1,
    previewSrc: paper1Preview,
    blend: "screen",
    defaultOpacity: 1,
  },
  {
    id: "paper2",
    label: "2",
    src: paper2,
    previewSrc: paper2Preview,
    blend: "soft-light",
    defaultOpacity: 0.5,
  },
  {
    id: "paper3",
    label: "3",
    src: paper3,
    previewSrc: paper3Preview,
    blend: "soft-light",
    defaultOpacity: 1,
  },
  // Example once you add textures:
  // { id: 'kraft', label: 'Kraft', src: kraft, previewSrc: kraftPreview, blend: 'multiply', defaultOpacity: 0.5 },
];

export const getPaper = (id: string): PaperPreset =>
  PAPERS.find((p) => p.id === id) ?? PAPERS[0];
