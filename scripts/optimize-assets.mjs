/**
 * Re-encode the bundled PNG assets to WebP. Run after adding or replacing a
 * source PNG in src/assets:
 *
 *   node scripts/optimize-assets.mjs
 *
 * The PNGs stay in the repo as masters; only the generated .webp files are
 * imported by the app. Each asset class gets its own treatment:
 *
 *   papers       full native resolution, high quality — the fine grain and
 *                halftone dots ARE the asset, so they are never downsampled.
 *                Each also gets a small `-preview` tier: every paper is on by
 *                default, so the previews paint immediately while the full-res
 *                textures stream in behind them (see usePaperImages).
 *   placeholders ordinary photos, sized to the largest region they can fill.
 *   logo         a wordmark drawn at ~316px wide at 2x export; 768 is ample.
 *
 * Every source is >=99.7% opaque (the alpha channel only carries a few
 * antialiased edge pixels), so alpha is flattened away — it costs a whole extra
 * plane in WebP and buys nothing here.
 */
import sharp from 'sharp'
import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const PAPERS = 'src/assets/papers'
const PLACEHOLDERS = 'src/assets/placeholders'

/**
 * Papers cover-fit the poster, so the most any texel is ever asked for is the
 * largest export canvas: the 9x16 story at 2x, 2160x3840. Shrinking a texture
 * to cover exactly that box is not a quality loss — it is the size it gets
 * drawn at — while anything above it is pixels the canvas throws away.
 */
const PAPER_COVER = { width: 2160, height: 3840 }
const PAPER_QUALITY = 88
const PAPER_PREVIEW = { longEdge: 1080, quality: 72 }
/** Largest region a placeholder fills is the full-bleed background at 2x. */
const PHOTO = { longEdge: 1600, quality: 80 }
const LOGO = { longEdge: 768, quality: 90 }

const kb = (n) => `${(n / 1024).toFixed(0)}KB`

async function encode(src, out, { longEdge, cover, quality, gray, background }) {
  let img = sharp(src).flatten({ background })
  if (longEdge) img = img.resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
  if (cover) img = img.resize({ ...cover, fit: 'outside', withoutEnlargement: true })
  if (gray) img = img.toColourspace('b-w')
  const info = await img.webp({ quality, effort: 6 }).toFile(out)
  const before = statSync(src).size
  console.log(
    `  ${basename(out).padEnd(26)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)}` +
      ` ${kb(before).padStart(7)} -> ${kb(info.size).padStart(7)}  (${(100 * info.size / before).toFixed(1)}%)`,
  )
  return info.size
}

/** True when every pixel's R, G and B are within 1 — i.e. the image is grayscale. */
async function isGrayscale(src) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.abs(data[i] - data[i + 1]) > 1 || Math.abs(data[i + 1] - data[i + 2]) > 1) return false
  }
  return true
}

const pngsIn = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(dir, f))

let total = 0

console.log('papers (full resolution, grain preserved)')
for (const src of pngsIn(PAPERS)) {
  const gray = await isGrayscale(src)
  const stem = join(dirname(src), basename(src, '.png'))
  total += await encode(src, `${stem}.webp`, { cover: PAPER_COVER, quality: PAPER_QUALITY, gray, background: '#000' })
  total += await encode(src, `${stem}-preview.webp`, { ...PAPER_PREVIEW, gray, background: '#000' })
}

console.log('placeholders (photos)')
for (const src of pngsIn(PLACEHOLDERS)) {
  const stem = join(dirname(src), basename(src, '.png'))
  total += await encode(src, `${stem}.webp`, { ...PHOTO, background: '#fff' })
}

console.log('logo')
total += await encode('src/assets/logo.png', 'src/assets/logo.webp', { ...LOGO, background: '#fff' })

console.log(`\ntotal webp: ${(total / 1024 / 1024).toFixed(2)}MB`)
