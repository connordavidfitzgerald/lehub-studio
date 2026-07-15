import { EDITORIAL_HEADER_SIZES, HEADER_MAX_RATIO, LOGO, PAD_RATIO } from '../../config/constants'
import { HEADER_FONT } from '../../config/fonts'
import type { RenderEnv } from '../env'
import {
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureSecondaryItem,
  type HeaderBlock,
} from '../elements'
import { fitHeader } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'

/**
 * Editorial layout: a vertically-centred, zero-gap stack of the header (spanning
 * the full width, highlighted in the palette's secondary colour) followed by up
 * to four paragraph containers. Each paragraph container spans 8 columns and can
 * hug the left or right edge of the canvas; the text inside stays left-aligned.
 * Background is either the palette's solid colour or the halftoned upload. Logo
 * sits bottom-left.
 */
export function drawEditorialLayout(env: RenderEnv): void {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO

  // --- Background: solid colour is already painted; image is halftoned full-bleed. ---
  if (state.bgMode === 'image' && state.image) {
    const ht = getHalftone(
      state.image,
      w * renderScale,
      h * renderScale,
      state.halftone,
      renderScale,
    )
    ctx.drawImage(ht, 0, 0, w, h)
  } else if (state.bgMode === 'image') {
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.06)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.font = `${env.secondarySize}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Upload a background image', w / 2, h / 2)
    ctx.restore()
  }

  // --- Header: full width, fit to width; highlight = secondary colour. ---
  const lines = state.header.split('\n').filter((l) => l.trim() !== '')
  // `full` fits the header to the width; small/medium are constant sizes (capped
  // to the width so long headers still don't overflow).
  const fitSize = fitHeader(ctx, lines, HEADER_FONT, w, pad, undefined, shortEdge * HEADER_MAX_RATIO).size
  const size =
    state.editorialHeaderSize === 'full'
      ? fitSize
      : Math.min(shortEdge * EDITORIAL_HEADER_SIZES[state.editorialHeaderSize], fitSize)
  const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
  const headerH = lines.length * lineAdvance

  // --- Secondary elements: each aligned per `side`, rendered per its `style`
  //     (paragraph = 8-column block; fitted = full-width badges). ---
  const containerW = env.g.span(8)
  const paragraphs = state.paragraphs.filter((p) => p.text.trim() !== '')
  const secSize = env.secondarySize
  const paraHeights = paragraphs.map((p) =>
    measureSecondaryItem(ctx, p, secSize, w, containerW, pad),
  )
  const paraTotal = paraHeights.reduce((a, b) => a + b, 0)

  // --- Vertically centre the whole (zero-gap) stack. ---
  const totalH = headerH + paraTotal
  let y = (h - totalH) / 2

  const block: HeaderBlock = {
    lines,
    size,
    containerX: 0,
    containerWidth: w,
    align: state.editorialHeaderAlign,
    lineAdvance,
    outlineColor: palette.secondaryBg,
  }
  drawHeaderBlock(ctx, block, y, shortEdge)
  y += headerH

  paragraphs.forEach((p, i) => {
    drawSecondaryItem(ctx, p, secSize, 0, w, y, palette.secondaryBg, pad, p.side, containerW)
    y += paraHeights[i]
  })

  // Logo bottom-left.
  drawLogo(ctx, env.assets.logo, 0, h, env.logoHeight, LOGO.fallbackText, 'left')
}
