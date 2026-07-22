import { useEffect } from 'react'
import { ArtboardStrip } from './components/ArtboardStrip'
import { Controls } from './components/Controls'
import { PosterPreview } from './components/PosterPreview'
import { UndoRedo } from './components/UndoRedo'
import { hydrateImages, usePoster } from './store/usePoster'

function App() {
  // Poster state can't carry the image element across a reload, only a reference
  // to it, so any artboard that has a reference but no image gets it (re)loaded —
  // on first paint, after a refresh, and whenever a category swaps the image in.
  const artboards = usePoster((st) => st.artboards)
  useEffect(() => {
    void hydrateImages()
  }, [artboards])

  // Cmd/Ctrl+Z to undo, Shift+Cmd/Ctrl+Z (or Ctrl+Y) to redo. Text fields keep
  // their own native undo — retyping a headline shouldn't cost a layout change.
  useEffect(() => {
    const isTextField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const key = e.key.toLowerCase()
      const redo = key === 'y' || (key === 'z' && e.shiftKey)
      if (key !== 'z' && !redo) return
      if (isTextField(e.target)) return
      e.preventDefault()
      const st = usePoster.getState()
      if (redo) st.redo()
      else st.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full w-full bg-white text-black">
      <aside className="flex w-[356px] shrink-0 flex-col gap-2 p-2 ">
        <div className="flex items-center justify-between gap-2 pr-0.5">
          <h1 className="text-xl px-2.5 py-1 font-review">Le HUB Poster Studio</h1>
          <UndoRedo />
        </div>
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
