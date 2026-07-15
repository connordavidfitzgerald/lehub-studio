import { useEffect, useRef } from 'react'
import { ASPECTS, LOGO } from '../config/constants'
import { useFontsReady } from '../hooks/useFontsReady'
import { useImage } from '../hooks/useImage'
import { usePaperImages } from '../hooks/usePaperImages'
import { renderPoster } from '../render/renderPoster'
import { useCurrentState } from '../store/usePoster'

export function PosterPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useCurrentState()
  const fontsReady = useFontsReady()

  const aspect = ASPECTS.find((a) => a.id === state.aspect)!
  const logo = useImage(LOGO.src)
  const papers = usePaperImages()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    canvas.width = aspect.w
    canvas.height = aspect.h
    const ctx = canvas.getContext('2d')!
    renderPoster(ctx, state, aspect.w, aspect.h, { logo, papers }, 1)
  }, [state, aspect.w, aspect.h, logo, papers, fontsReady])

  return (
    <div className="flex h-full items-center justify-center overflow-hidden p-6">
      <canvas
        ref={canvasRef}
        className="max-h-[85vh] max-w-full border border-black"
        style={{ width: 'auto', height: 'auto', imageRendering: 'auto' }}
      />
    </div>
  )
}
