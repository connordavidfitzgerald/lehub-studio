import { useEffect, useRef } from 'react'
import { ArtboardStrip } from './components/ArtboardStrip'
import { Controls } from './components/Controls'
import { PosterPreview } from './components/PosterPreview'

import { usePlaceholderImages } from './hooks/usePlaceholderImages'
import { DEFAULT_CATEGORY, sessionRestored, usePoster } from './store/usePoster'

function App() {
  // Load the default category's placeholder image onto the initial artboard once
  // it's ready (only while that artboard is still the untouched default). Skipped
  // for a restored session: its artboards are the user's, not a fresh default.
  const placeholders = usePlaceholderImages()
  const inited = useRef(sessionRestored)
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
      <aside className="flex w-[356px] shrink-0 flex-col gap-2 p-2 ">
        <h1 className="text-xl px-2.5 py-1 font-review">Le HUB Poster Studio</h1>
        <div className="min-h-0 flex-1">
          <Controls />
        </div>
      </aside>
      <main className="relative min-w-0 flex-1">
        <PosterPreview />
        <div className="absolute bottom-0 left-0 max-w-full p-2">
          <ArtboardStrip />
        </div>
      </main>
    </div>
  )
}

export default App
