import { useEffect, useMemo, useRef } from 'react'
import { ASPECTS, LOGO } from '../config/constants'
import { useFontsReady } from '../hooks/useFontsReady'
import { useGenerativeDrag } from '../hooks/useGenerativeDrag'
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
  // Stable identity: the drag planner re-plans whenever `assets` changes.
  const assets = useMemo(() => ({ logo, papers }), [logo, papers])

  const { preview, cursor, handlers } = useGenerativeDrag(
    canvasRef,
    state,
    aspect.w,
    aspect.h,
    assets,
    state.layout === 'generative' && fontsReady,
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    canvas.width = aspect.w
    canvas.height = aspect.h
    const ctx = canvas.getContext('2d')!
    renderPoster(ctx, state, aspect.w, aspect.h, assets, 1)
  }, [state, aspect.w, aspect.h, assets, fontsReady])

  return (
    <div className="flex h-full items-center justify-center overflow-hidden p-6">
      {/* The overlay tracks the canvas box, so it wraps rather than sits beside it. */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          {...handlers}
          style={{ width: 'auto', height: 'auto', imageRendering: 'auto', cursor, touchAction: 'none' }}
          className="block max-h-[85vh] max-w-full border border-black"
        />
        {preview && (
          // Drop feedback only — never drawn into the canvas, so exports stay clean.
          <svg
            viewBox={`0 0 ${aspect.w} ${aspect.h}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {preview.region && (
              <rect
                x={preview.region.x}
                y={preview.region.y}
                width={preview.region.w}
                height={preview.region.h}
                fill="rgba(0,0,0,0.04)"
              />
            )}
            {preview.targets.map((t, i) => (
              <circle
                key={i}
                cx={t.anchor.x}
                cy={t.anchor.y}
                r={aspect.w * 0.006}
                fill={
                  preview.slot &&
                  preview.slot.region === t.region &&
                  preview.slot.v === t.v &&
                  preview.slot.h === t.h
                    ? '#FF669E'
                    : 'rgba(0,0,0,0.35)'
                }
              />
            ))}
            <rect
              x={preview.ghost.x}
              y={preview.ghost.y}
              width={preview.ghost.w}
              height={preview.ghost.h}
              fill="rgba(255,102,158,0.15)"
              stroke="#FF669E"
              strokeWidth={aspect.w * 0.004}
            />
            {/* Resizing: show the room the text is left with, and the grid it snaps to. */}
            {preview.textZone && (
              <rect
                x={preview.textZone.x}
                y={preview.textZone.y}
                width={preview.textZone.w}
                height={preview.textZone.h}
                fill="none"
                stroke="rgba(0,0,0,0.35)"
                strokeDasharray={`${aspect.w * 0.012} ${aspect.w * 0.012}`}
                strokeWidth={aspect.w * 0.002}
              />
            )}
            {preview.gridLines?.map((g, i) => (
              <line
                key={i}
                x1={g.x1}
                y1={g.y1}
                x2={g.x2}
                y2={g.y2}
                stroke="rgba(0,0,0,0.18)"
                strokeWidth={aspect.w * 0.0015}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
