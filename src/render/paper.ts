/** Overlay a paper texture across the whole poster (printed-on-paper feel). */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  w: number,
  h: number,
  blend: GlobalCompositeOperation,
  opacity: number,
): void {
  if (!img || !img.naturalWidth || opacity <= 0) return
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.globalCompositeOperation = blend
  // Cover-fit the texture.
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  ctx.restore()
}
