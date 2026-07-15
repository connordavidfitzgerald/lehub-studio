import { useEffect, useRef } from 'react'
import { ArtboardStrip } from './components/ArtboardStrip'
import { Controls } from './components/Controls'
import { PosterPreview } from './components/PosterPreview'
import { labelClass } from './components/ui'
import { usePlaceholderImages } from './hooks/usePlaceholderImages'
import { DEFAULT_CATEGORY, usePoster } from './store/usePoster'

function App() {
  // Load the default category's placeholder image onto the initial artboard once
  // it's ready (only while that artboard is still the untouched default).
  const placeholders = usePlaceholderImages()
  const inited = useRef(false)
  useEffect(() => {
    if (inited.current) return
    const img = placeholders[DEFAULT_CATEGORY]
    if (!img) return
    inited.current = true
    const st = usePoster.getState()
    const cur = st.artboards.find((a) => a.id === st.currentId)
    if (cur && cur.state.image === null && cur.state.categoryId === DEFAULT_CATEGORY) {
      st.setImage(img)
    }
  }, [placeholders])

  return (
    <div className="flex h-full w-full bg-white text-black">
      <main className="relative min-w-0 flex-1">
        <PosterPreview />
        <div className="absolute left-0 top-0 p-2">
          <h1 className={labelClass}>Le HUB Poster Studio</h1>
        </div>
        <div className="absolute bottom-0 left-0 max-w-full p-2">
          <ArtboardStrip />
        </div>
      </main>
      <aside className="flex w-[356px] shrink-0 flex-col p-2">
        <Controls />
      </aside>
    </div>
  )
}

export default App
