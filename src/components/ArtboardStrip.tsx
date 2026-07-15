import { useEffect, useMemo, useRef, useState } from 'react'
import { ASPECTS, LOGO } from '../config/constants'
import { useFontsReady } from '../hooks/useFontsReady'
import { useImage } from '../hooks/useImage'
import { usePaperImages } from '../hooks/usePaperImages'
import type { RenderAssets } from '../render/env'
import { renderPoster } from '../render/renderPoster'
import { usePoster, type Artboard } from '../store/usePoster'
import { labelClass } from './ui'

// Thumbnails render at 2× the displayed size for crispness on hi-dpi screens.
const DISPLAY_H = 84
const RENDER_H = DISPLAY_H * 2

function ArtboardThumb({
  artboard,
  active,
  assets,
  fontsReady,
  canDelete,
  dragging,
  dropBefore,
  onSelect,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: {
  artboard: Artboard
  active: boolean
  assets: RenderAssets
  fontsReady: boolean
  canDelete: boolean
  dragging: boolean
  dropBefore: boolean
  onSelect: () => void
  onDuplicate: () => void
  onRemove: () => void
  onDragStart: () => void
  onDragEnter: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = artboard.state
  const aspect = ASPECTS.find((a) => a.id === state.aspect)!
  const ratio = aspect.w / aspect.h
  const renderW = Math.round(RENDER_H * ratio)
  const displayW = Math.round(DISPLAY_H * ratio)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    canvas.width = renderW
    canvas.height = RENDER_H
    const ctx = canvas.getContext('2d')!
    renderPoster(ctx, state, renderW, RENDER_H, assets, 1)
  }, [state, renderW, assets, fontsReady])

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', artboard.id) // Firefox needs data set
        onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()} // allow drop
      onDragEnter={onDragEnter}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      style={{ opacity: dragging ? 0.4 : 1 }}
      className={`group relative shrink-0 ${
        dropBefore
          ? 'before:absolute before:-left-1 before:top-0 before:h-full before:w-0.5 before:bg-black'
          : ''
      }`}
    >
      <button
        onClick={onSelect}
        className={`block cursor-grab overflow-hidden border transition active:cursor-grabbing ${
          active ? 'border-black ring-1 ring-black' : 'border-black/20 hover:border-black'
        }`}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: displayW, height: DISPLAY_H }}
        />
      </button>
      <div className="pointer-events-none absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          onClick={onDuplicate}
          title="Duplicate"
          className="border border-black bg-white px-1.5 py-0.5 text-[11px] leading-none text-black hover:bg-black hover:text-white"
        >
          ⧉
        </button>
        {canDelete && (
          <button
            onClick={onRemove}
            title="Delete"
            className="border border-black bg-white px-1.5 py-0.5 text-[11px] leading-none text-black hover:bg-black hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

export function ArtboardStrip() {
  const artboards = usePoster((st) => st.artboards)
  const currentId = usePoster((st) => st.currentId)
  const selectArtboard = usePoster((st) => st.selectArtboard)
  const addArtboard = usePoster((st) => st.addArtboard)
  const duplicateArtboard = usePoster((st) => st.duplicateArtboard)
  const removeArtboard = usePoster((st) => st.removeArtboard)
  const reorderArtboard = usePoster((st) => st.reorderArtboard)

  const fontsReady = useFontsReady()
  const logo = useImage(LOGO.src)
  const papers = usePaperImages()
  const assets = useMemo<RenderAssets>(() => ({ logo, papers }), [logo, papers])

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const endDrag = () => {
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <h2 className={labelClass}>Artboards</h2>
      <div className="flex items-center gap-2 overflow-x-auto">
        {artboards.map((ab) => (
          <ArtboardThumb
            key={ab.id}
            artboard={ab}
            active={ab.id === currentId}
            assets={assets}
            fontsReady={fontsReady}
            canDelete={artboards.length > 1}
            dragging={dragId === ab.id}
            dropBefore={overId === ab.id && dragId !== null && dragId !== ab.id}
            onSelect={() => selectArtboard(ab.id)}
            onDuplicate={() => duplicateArtboard(ab.id)}
            onRemove={() => removeArtboard(ab.id)}
            onDragStart={() => setDragId(ab.id)}
            onDragEnter={() => dragId && setOverId(ab.id)}
            onDrop={() => {
              if (dragId) reorderArtboard(dragId, ab.id)
              endDrag()
            }}
            onDragEnd={endDrag}
          />
        ))}
        <button
          onClick={addArtboard}
          title="New artboard"
          style={{ height: DISPLAY_H }}
          className="flex aspect-[4/5] shrink-0 items-center justify-center border border-black text-black transition hover:bg-black/5"
        >
          <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1}>
            <path d="M10 3.5v13M3.5 10h13" />
          </svg>
        </button>
      </div>
    </div>
  )
}
