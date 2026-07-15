import { useEffect, useState } from 'react'
import { PAPERS } from '../config/papers'

/**
 * Preload every paper texture once and return them keyed by paper id, so any
 * combination of active papers can be composited without re-loading.
 */
export function usePaperImages(): Record<string, HTMLImageElement | null> {
  const [map, setMap] = useState<Record<string, HTMLImageElement | null>>({})
  useEffect(() => {
    let alive = true
    PAPERS.forEach((p) => {
      if (!p.src) return
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        if (alive) setMap((m) => ({ ...m, [p.id]: image }))
      }
      image.src = p.src
    })
    return () => {
      alive = false
    }
  }, [])
  return map
}
