import { useEffect, useState } from 'react'

/** Load an image from a URL, returning it once ready (or null). */
export function useImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) {
      setImg(null)
      return
    }
    let alive = true
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => alive && setImg(image)
    image.src = src
    return () => {
      alive = false
    }
  }, [src])
  return img
}
