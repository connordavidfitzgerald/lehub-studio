import { useEffect, useState } from 'react'
import { loadFonts } from '../config/fonts'

let readyPromise: Promise<void> | null = null

/** True once brand fonts (if any) are loaded and document.fonts is ready. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!readyPromise) readyPromise = loadFonts()
    let alive = true
    readyPromise.then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  return ready
}
