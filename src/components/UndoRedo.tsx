import { usePoster } from '../store/usePoster'

/** Curved arrow; mirrored horizontally for redo. */
function UndoArrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path
        d="M2.5 5.5h7a3.5 3.5 0 0 1 0 7H6"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="square"
      />
      <path d="M5.5 2.5 2 5.5l3.5 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" />
    </svg>
  )
}

const BTN =
  'flex h-7 w-7 items-center justify-center border border-black bg-white text-black transition hover:bg-black/5 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-white'

/** Undo / redo, mirroring the Cmd+Z shortcuts and disabled when there's nothing to do. */
export function UndoRedo() {
  const past = usePoster((st) => st.past.length)
  const future = usePoster((st) => st.future.length)
  const undo = usePoster((st) => st.undo)
  const redo = usePoster((st) => st.redo)

  // Label the shortcut the way this platform writes it.
  const mod = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'

  return (
    <div className="flex gap-1">
      <button
        onClick={undo}
        disabled={past === 0}
        className={BTN}
        title={`Undo (${mod}Z)`}
        aria-label="Undo"
      >
        <UndoArrow />
      </button>
      <button
        onClick={redo}
        disabled={future === 0}
        className={BTN}
        title={`Redo (${mod}⇧Z)`}
        aria-label="Redo"
      >
        <UndoArrow flip />
      </button>
    </div>
  )
}
