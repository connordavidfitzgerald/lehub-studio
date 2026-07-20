import { useState, type ReactNode } from 'react'
import type { SecondaryPos, TextAlign } from '../types'

/**
 * The black label chip: Review Bold, uppercase, white on black, 16px / 100%
 * line-height. Shared by section titles, the page title and the artboards label.
 */
export const labelClass =
  'block w-fit font-review uppercase text-md leading-none text-black px-2 py-1'

/** Smaller chip for nested sub-sections (e.g. Header/Text inside Content). */
export const subLabelClass =
  'block w-fit font-review text-sm  leading-none text-black px-2.5 py-1'

export function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = false,
  action,
  sub = false,
  open,
  onOpenChange,
}: {
  title: string
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  /** Optional control rendered across from the title (e.g. a "Clear" button). */
  action?: ReactNode
  /** Render as a nested sub-section (smaller chip), e.g. inside another Section. */
  sub?: boolean
  /** Controlled open state. When provided, the parent owns open/closed. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = open ?? internalOpen
  const toggle = () => {
    const next = !isOpen
    if (open === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const chip = sub ? subLabelClass : labelClass
  const header = collapsible ? (
    <button type="button" onClick={toggle} className={`${chip} flex items-center gap-2`}>
      <span>{title}</span>
      <Chevron open={isOpen} />
    </button>
  ) : (
    <h2 className={chip}>{title}</h2>
  )
  const shown = !collapsible || isOpen
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between">
        {header}
        {shown && action}
      </div>
      {shown && (
        <div className={`flex flex-col gap-2 ${sub ? 'pt-1.5' : 'p-2'}`}>{children}</div>
      )}
    </section>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2 px-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 border border-black px-[10px] py-[7px] text-xs font-bold transition ${
            value === o.value
              ? 'bg-black text-white'
              : 'bg-white text-black hover:bg-black/5'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Input-style drawer label (matches the TextField label). */
const drawerLabelClass = 'font-review uppercase text-xs text-black pb-1 py-0.5'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  )
}

/** A labelled, collapsible drawer around arbitrary children (hidden by default). */
export function Drawer({
  label,
  children,
  defaultOpen = false,
  padded = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
  /** Inset the children by px-1, matching the Segmented controls' gutter. */
  padded?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between ${drawerLabelClass}`}
      >
        <span>{label}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className={`flex flex-col gap-2 ${padded ? 'px-1' : ''}`}>{children}</div>
      )}
    </div>
  )
}

/**
 * A labelled Segmented control. Collapsible by default (label row toggles a down
 * chevron); pass `collapsible={false}` to keep the buttons always visible.
 */
export function SegmentedDrawer<T extends string>({
  label,
  value,
  options,
  onChange,
  collapsible = true,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(false)
  const segmented = <Segmented value={value} options={options} onChange={onChange} />
  if (!collapsible) {
    return (
      <div className="flex flex-col gap-1">
        <div className={drawerLabelClass}>{label}</div>
        {segmented}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between ${drawerLabelClass}`}
      >
        <span>{label}</span>
        <Chevron open={open} />
      </button>
      {open && segmented}
    </div>
  )
}

/** Position icon: outlined rectangle with a filled square at the given corner. */
export function PositionIcon({ pos }: { pos: SecondaryPos }) {
  const [vert, horiz] = pos.split('-') as ['top' | 'bottom', 'left' | 'right']
  const sq = 5
  const x = horiz === 'left' ? 3 : 24 - sq - 3
  const y = vert === 'top' ? 3 : 18 - sq - 3
  return (
    <svg width={20} height={15} viewBox="0 0 24 18" fill="none">
      <rect x={1} y={1} width={22} height={16} stroke="currentColor" strokeWidth={1} />
      <rect x={x} y={y} width={sq} height={sq} fill="currentColor" />
    </svg>
  )
}

/** Standard text-align icon (three lines aligned left / centre / right). */
export function AlignIcon({ align }: { align: TextAlign }) {
  const widths = [13, 8, 11]
  return (
    <svg width={16} height={12} viewBox="0 0 16 12" fill="none">
      {widths.map((wLine, i) => {
        const x = align === 'left' ? 1.5 : align === 'right' ? 14.5 - wLine : (16 - wLine) / 2
        return <rect key={i} x={x} y={2 + i * 4} width={wLine} height={1.5} fill="currentColor" />
      })}
    </svg>
  )
}

/** Shared icon frame: a 24×18 outlined artboard, matching the position icons. */
function IconFrame({ children, outline = true }: { children?: ReactNode; outline?: boolean }) {
  return (
    <svg width={20} height={15} viewBox="0 0 24 18" fill="none">
      {outline && <rect x={1} y={1} width={22} height={16} stroke="currentColor" strokeWidth={1} />}
      {children}
    </svg>
  )
}

/** Half icon: the top or bottom band of the artboard filled (split text side). */
export function HalfIcon({ half }: { half: 'top' | 'bottom' }) {
  return (
    <IconFrame>
      <rect x={1} y={half === 'top' ? 1 : 9} width={22} height={8} fill="currentColor" />
    </IconFrame>
  )
}

/**
 * Image-position icon: the image band drawn where it will sit — across the poster
 * at top / middle / bottom, or down a side at left / middle / right. The empty
 * part of the frame is where the text reflows to.
 */
export function ImageAlignIcon({
  align,
  axis,
}: {
  align: 'start' | 'middle' | 'end'
  axis: 'vertical' | 'horizontal'
}) {
  const at = (start: number, mid: number, end: number) =>
    align === 'start' ? start : align === 'end' ? end : mid
  return (
    <IconFrame>
      {axis === 'vertical' ? (
        <rect x={1} y={at(1, 6, 11)} width={22} height={6} fill="currentColor" />
      ) : (
        <rect x={at(1, 8, 15)} y={1} width={8} height={16} fill="currentColor" />
      )}
    </IconFrame>
  )
}

/**
 * Size icon: a filled square of `scale` (0–1 of the box height) centred in the
 * outlined artboard — small square = narrow, big square = full.
 */
export function SizeIcon({ scale }: { scale: number }) {
  const s = Math.round(16 * scale)
  const x = 1 + (22 - s) / 2
  const y = 1 + (16 - s) / 2
  return (
    <IconFrame>
      <rect x={x} y={y} width={s} height={s} fill="currentColor" />
    </IconFrame>
  )
}

/**
 * Label-position icon (centered layout): the category badge pinned to the top
 * edge, or stacked directly above the centred text lines.
 */
export function LabelPosIcon({ pos }: { pos: 'top' | 'above' }) {
  const badgeY = pos === 'top' ? 3 : 6
  return (
    <IconFrame>
      <rect x={8} y={badgeY} width={8} height={2.5} fill="currentColor" />
      <rect x={6} y={10} width={12} height={1.6} fill="currentColor" />
      <rect x={8} y={13} width={8} height={1.6} fill="currentColor" />
    </IconFrame>
  )
}

/** Background icon: solid = filled artboard; image = a simple picture glyph. */
export function BgIcon({ mode }: { mode: 'solid' | 'image' }) {
  if (mode === 'solid') {
    return (
      <IconFrame outline={false}>
        <rect x={1} y={1} width={22} height={16} fill="currentColor" />
      </IconFrame>
    )
  }
  return (
    <IconFrame>
      <circle cx={7} cy={6} r={2} fill="currentColor" />
      <path d="M2 16 L9 10 L13 13 L18 7 L22 12 L22 17 L2 17 Z" fill="currentColor" />
    </IconFrame>
  )
}

/** Layout icon: a small glyph for each layout mode, matching the position-icon style. */
export function LayoutIcon({
  layout,
}: {
  layout: 'split' | 'centered' | 'editorial' | 'generate'
}) {
  if (layout === 'split') {
    return (
      <IconFrame>
        <rect x={1} y={1} width={22} height={8} fill="currentColor" />
      </IconFrame>
    )
  }
  if (layout === 'centered') {
    return (
      <IconFrame>
        {[6, 9, 12].map((y, i) => {
          const w = [12, 8, 10][i]
          return <rect key={i} x={(24 - w) / 2} y={y} width={w} height={1.6} fill="currentColor" />
        })}
      </IconFrame>
    )
  }
  if (layout === 'editorial') {
    return (
      <IconFrame>
        <rect x={4} y={4} width={9} height={6} fill="currentColor" />
        <rect x={4} y={12} width={14} height={1.6} fill="currentColor" />
      </IconFrame>
    )
  }
  // generate: a four-point sparkle.
  return (
    <IconFrame outline={false}>
      <path
        d="M12 2 C 12.5 7, 13 8, 19 9 C 13 10, 12.5 11, 12 16 C 11.5 11, 11 10, 5 9 C 11 8, 11.5 7, 12 2 Z"
        fill="currentColor"
      />
    </IconFrame>
  )
}

/** A labelled grid of icon buttons acting as a single-choice selector. */
export function IconChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  cols = 3,
}: {
  label?: string
  value: T
  options: { value: T; icon: ReactNode; title?: string }[]
  onChange: (v: T) => void
  cols?: number
}) {
  return (
    <div className="flex flex-col gap-1 px-1">
      {label && <div className={drawerLabelClass}>{label}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-center border border-black py-[7px] transition ${
              value === o.value ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/5'
            }`}
          >
            {o.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="block mt-0.5">
      <div className="flex justify-between text-xs px-1 font-mono uppercase text-black">
        <span>{label}</span>
        <span className="">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full px-1"
      />
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
}) {
  const cls =
    'w-full border border-black bg-white px-2 py-2 text-sm leading-tight text-black font-medium outline-none focus:ring-1 focus:ring-black'
  return (
    <label className="block px-1">
      {label && <div className="py-1 font-review uppercase text-xs text-black">{label}</div>}
      {multiline ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className={cls + ' resize-none'}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  )
}
