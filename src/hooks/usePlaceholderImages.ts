import { useEffect, useState } from 'react'
import { CATEGORY_PRESETS } from '../config/categoryPresets'

/**
 * Preload the per-category placeholder images once, keyed by category id, so
 * selecting a category can set its image synchronously.
 */
export function usePlaceholderImages(): Record<string, HTMLImageElement | null> {
  const [map, setMap] = useState<Record<string, HTMLImageElement | null>>({})
  useEffect(() => {
    let alive = true
    Object.entries(CATEGORY_PRESETS).forEach(([id, preset]) => {
      if (!preset.image) return
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        if (alive) setMap((m) => ({ ...m, [id]: image }))
      }
      image.src = preset.image
    })
    return () => {
      alive = false
    }
  }, [])
  return map
}
