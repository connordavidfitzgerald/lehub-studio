import { EDITORIAL_HEADER_SIZES, HEADER_MAX_RATIO, LOGO, PAD_RATIO } from '../../config/constants'
import { HEADER_FONT } from '../../config/fonts'
import type { GenElementKey } from '../../types'
import type { RenderEnv } from '../env'
import {
  drawHeaderBlock,
  drawLogo,
  drawSecondaryItem,
  headerCapAscent,
  measureSecondaryItem,
  type HAlign,
  type HeaderBlock,
} from '../elements'
import { fitHeader } from '../text/autofit'
import { getHalftone } from '../halftone/halftoneRenderer'
import {
  clampHeaderCols,
  composePreset,
  logoBox,
  pinnedPlacements,
  placement,
  slotOf,
  type PinnedItem,
} from './presetPlan'
import type { Placement } from './generativePlan'

/**
 * Editorial layout: a vertically-centred, zero-gap stack of the header (spanning
 * the full width, highlighted in the palette's secondary colour) followed by up
 * to four paragraph containers. Each paragraph container spans 8 columns and can
 * hug the left or right edge of the canvas; the text inside stays left-aligned.
 * Background is either the palette's solid colour or the halftoned upload. Logo
 * sits bottom-left.
 *
 * Any element dragged on the canvas is pinned to a cell of the 3×3 grid and
 * leaves this stack, which then closes up behind it.
 */
export function drawEditorialLayout(env: RenderEnv): void {
  const { ctx, state, palette, w, h, shortEdge, renderScale } = env
  const pad = shortEdge * PAD_RATIO

  // --- Background: solid colour is already painted; image is halftoned full-bleed. ---
  if (env.measuring) {
    // Planning pass: the background costs a shader run and moves nothing.
  } else if (state.bgMode === 'image' && state.image) {
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

  const pinned: PinnedItem[] = []
  const flow: Placement[] = []

  // --- Header: spans the full width unless its edge has been dragged in, fit to
  //     that width; highlight = secondary colour. ---
  const lines = state.header.split('\n').filter((l) => l.trim() !== '')
  const headerCols = clampHeaderCols(state.editorialHeaderCols)
  const headerW = headerCols === null ? w : env.g.span(headerCols)
  // `full` fits the header to the width; small/medium are constant sizes (capped
  // to the width so long headers still don't overflow).
  const fitSize = fitHeader(ctx, lines, HEADER_FONT, headerW, pad, undefined, shortEdge * HEADER_MAX_RATIO).size
  const size =
    state.editorialHeaderSize === 'full'
      ? fitSize
      : Math.min(shortEdge * EDITORIAL_HEADER_SIZES[state.editorialHeaderSize], fitSize)
  const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
  const headerH = lines.length * lineAdvance
  const drawHeader = (x: number, y: number, align: HAlign) => {
    const block: HeaderBlock = {
      lines,
      size,
      containerX: x,
      containerWidth: headerW,
      align,
      lineAdvance,
      outlineColor: palette.secondaryBg,
    }
    drawHeaderBlock(ctx, block, y, shortEdge)
  }

  // --- Secondary elements: each aligned per `side`, rendered per its `style`
  //     (paragraph = 8-column block; fitted = full-width badges). ---
  const containerW = env.g.span(8)
  // Indices ride along so a dragged block writes back to the right entry.
  const kept = state.paragraphs
    .map((p, i) => ({ p, key: `p${i}` as GenElementKey }))
    .filter(({ p }) => p.text.trim() !== '')
  const secSize = env.secondarySize
  const paraHeights = kept.map(({ p }) => measureSecondaryItem(ctx, p, secSize, w, containerW, pad))

  const headerSlot = slotOf(state, 'header')
  if (headerSlot) {
    pinned.push({ key: 'header', box: { w: headerW, h: headerH }, slot: headerSlot, drawAt: drawHeader })
  }

  // Only the elements still in the flow contribute to the centred stack.
  const flowing = kept
    .map((item, i) => ({ ...item, h: paraHeights[i] }))
    .filter(({ key }) => !slotOf(state, key))
  const flowTotal = (headerSlot ? 0 : headerH) + flowing.reduce((sum, f) => sum + f.h, 0)

  // --- Vertically centre the whole (zero-gap) stack. ---
  let y = (h - flowTotal) / 2

  if (!headerSlot) {
    const headerX =
      state.editorialHeaderAlign === 'left'
        ? 0
        : state.editorialHeaderAlign === 'right'
          ? w - headerW
          : (w - headerW) / 2
    flow.push(
      placement(
        'header',
        { x: headerX, y, w: headerW, h: headerH },
        state.editorialHeaderAlign,
        null,
        // The block draws within a container of its own width, so it lands where
        // it is placed whatever the alignment.
        (x, top, align) => drawHeader(x, top, align),
      ),
    )
    y += headerH
  }

  // A paragraph's box is the container it hugs, so the whole block is grabbable
  // rather than just the glyphs inside it.
  kept.forEach(({ p, key }, i) => {
    const boxW = p.style === 'paragraph' ? containerW : w
    const drawPara = (x: number, top: number, align: HAlign) => {
      // `drawSecondaryItem` places the block within [left, right] by `align`, so
      // hand it a span exactly as wide as the block to land it at `x`.
      drawSecondaryItem(ctx, p, secSize, x, x + boxW, top, palette.secondaryBg, pad, align, boxW)
    }
    const slot = slotOf(state, key)
    if (slot) {
      pinned.push({ key, box: { w: boxW, h: paraHeights[i] }, slot, drawAt: drawPara })
      return
    }
    const boxX = p.side === 'right' ? w - boxW : p.side === 'center' ? (w - boxW) / 2 : 0
    flow.push(
      placement(key, { x: boxX, y, w: boxW, h: paraHeights[i] }, p.side, null, drawPara),
    )
    y += paraHeights[i]
  })

  // Logo bottom-left, unless it has been pinned elsewhere.
  const logo = logoBox(env)
  const drawLogoAt = (x: number, top: number) =>
    drawLogo(ctx, env.assets.logo, x, top + logo.h, env.logoHeight, LOGO.fallbackText, 'left')
  const logoSlot = slotOf(state, 'logo')
  if (logoSlot) {
    pinned.push({ key: 'logo', box: logo, slot: logoSlot, drawAt: (x, top) => drawLogoAt(x, top) })
  } else {
    flow.push(
      placement('logo', { x: 0, y: h - logo.h, w: logo.w, h: logo.h }, 'left', null, (x, top) =>
        drawLogoAt(x, top),
      ),
    )
  }

  composePreset(env, [...flow, ...pinnedPlacements(env, pinned)])
}
