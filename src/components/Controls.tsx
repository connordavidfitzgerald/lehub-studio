import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import { ASPECTS, LOGO, MAX_PARAGRAPHS, OUTLINE_COLOR } from '../config/constants'
import { PALETTES, getPalette } from '../config/palettes'
import { getPaper } from '../config/papers'
import { exportPoster, type ExportFormat } from '../render/export'
import { useImage } from '../hooks/useImage'
import { usePaperImages } from '../hooks/usePaperImages'
import { usePlaceholderImages } from '../hooks/usePlaceholderImages'
import { makeParagraph, usePoster, useCurrentState } from '../store/usePoster'
import {
  imageAlignAxis,
  mulberry32,
  planImage,
} from '../render/layouts/generativeLayout'
import type {
  EditorialHeaderSize,
  GenAlign,
  GenHeaderWidth,
  GenImageAlign,
  HalfPosition,
  HeaderWidthMode,
  LayoutId,
  Paragraph,
  SecondaryPos,
  SlideType,
  TextAlign,
} from '../types'
import {
  AlignIcon,
  BgIcon,
  Drawer,
  HalfIcon,
  IconChoice,
  ImageAlignIcon,
  LayoutIcon,
  PositionIcon,
  Section,
  Segmented,
  SegmentedDrawer,
  SizeIcon,
  Slider,
  TextField,
} from './ui'

// Shared button style: Helvetica bold 12px, 7px/10px padding, 1px black border.
const BTN = 'border border-black px-[10px] py-[7px] text-xs font-bold transition'
const BTN_ON = `${BTN} bg-black text-white hover:bg-black/80`

// "+ Add text": same button, tighter horizontal padding. Written out rather than
// appended to BTN so its px isn't fighting the shared px-[10px].
const ADD_BTN =
  ' text-xs text-left opacity-30 font-review uppercase transition text-black hover:opacity-50'

// Preset "Save" — greys out until the name field has something in it.
const SAVE_BTN = `${BTN} shrink-0 bg-black text-white hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/20 disabled:hover:bg-black/20`

// Subtle text button sitting across from a section title (e.g. "Clear").
const CLEAR_BTN = 'px-2 font-review text-xs uppercase text-black/30 transition hover:text-black'

// Bordered card wrapper shared by the Header block and each secondary text item.
const CARD = 'flex flex-col gap-2 border border-black pt-2 px-1'

const ALIGN_OPTIONS: { value: TextAlign; icon: ReactNode; title: string }[] = [
  { value: 'left', icon: <AlignIcon align="left" />, title: 'Left' },
  { value: 'center', icon: <AlignIcon align="center" />, title: 'Center' },
  { value: 'right', icon: <AlignIcon align="right" />, title: 'Right' },
]

// Generative alignment adds `auto` (seeded per-element scheme) ahead of the fixed
// alignments.
const GEN_ALIGN_OPTIONS: { value: GenAlign; icon: ReactNode; title: string }[] = [
  { value: 'auto', icon: <span className="text-xs font-bold">Auto</span>, title: 'Auto' },
  ...ALIGN_OPTIONS,
]

// Four corners, laid out 2×2 to mirror their positions within the chosen half.
const POSITION_OPTIONS: { value: SecondaryPos; icon: ReactNode; title: string }[] = [
  { value: 'top-left', icon: <PositionIcon pos="top-left" />, title: 'Top left' },
  { value: 'top-right', icon: <PositionIcon pos="top-right" />, title: 'Top right' },
  { value: 'bottom-left', icon: <PositionIcon pos="bottom-left" />, title: 'Bottom left' },
  { value: 'bottom-right', icon: <PositionIcon pos="bottom-right" />, title: 'Bottom right' },
]

const HALF_OPTIONS: { value: HalfPosition; icon: ReactNode; title: string }[] = [
  { value: 'top', icon: <HalfIcon half="top" />, title: 'Top' },
  { value: 'bottom', icon: <HalfIcon half="bottom" />, title: 'Bottom' },
]

const ASPECT_OPTIONS = ASPECTS.map((a) => ({ value: a.id, label: a.label }))

// The four layout styles. `generate` is a virtual value handled by the picker (it
// triggers generateLayout, which reseeds using the slide's current colour).
type LayoutChoice = 'split' | 'centered' | 'editorial' | 'generate'

const LAYOUT_OPTIONS: { value: LayoutChoice; icon: ReactNode; title: string }[] = [
  { value: 'split', icon: <LayoutIcon layout="split" />, title: 'Split' },
  { value: 'centered', icon: <LayoutIcon layout="centered" />, title: 'Centered' },
  { value: 'editorial', icon: <LayoutIcon layout="editorial" />, title: 'Editorial' },
  { value: 'generate', icon: <LayoutIcon layout="generate" />, title: 'Generate' },
]

// Centered header width: small square = middle-8 columns, big square = full width.
const HEADER_WIDTH_OPTIONS: { value: HeaderWidthMode; icon: ReactNode; title: string }[] = [
  { value: 'cols8', icon: <SizeIcon scale={0.45} />, title: 'Middle 8 columns' },
  { value: 'full', icon: <SizeIcon scale={0.85} />, title: 'Full width' },
]

const EDITORIAL_SIZE_OPTIONS: { value: EditorialHeaderSize; icon: ReactNode; title: string }[] = [
  { value: 'small', icon: <SizeIcon scale={0.4} />, title: 'Small' },
  { value: 'medium', icon: <SizeIcon scale={0.62} />, title: 'Medium' },
  { value: 'full', icon: <SizeIcon scale={0.9} />, title: 'Full' },
]

const BG_OPTIONS: { value: 'solid' | 'image'; icon: ReactNode; title: string }[] = [
  { value: 'solid', icon: <BgIcon mode="solid" />, title: 'Solid colour' },
  { value: 'image', icon: <BgIcon mode="image" />, title: 'Image' },
]

// Generative header size: `auto` reads as a text button, the fixed spans reuse the
// square Size glyphs (small → full) so they match the centered layout's control.
const GEN_SIZE_OPTIONS: { value: GenHeaderWidth; icon: ReactNode; title: string }[] = [
  { value: 'auto', icon: <span className="text-xs font-bold">Auto</span>, title: 'Auto' },
  { value: 'narrow', icon: <SizeIcon scale={0.4} />, title: 'Narrow' },
  { value: 'wide', icon: <SizeIcon scale={0.62} />, title: 'Wide' },
  { value: 'full', icon: <SizeIcon scale={0.9} />, title: 'Full' },
]

const STYLE_OPTIONS = [
  { value: 'fitted' as const, label: 'Fitted' },
  { value: 'paragraph' as const, label: 'Paragraph' },
]

// Where the image band sits; the text reflows into what's left. The seeded band
// decides the axis, so the labels follow it: a band across the poster moves
// top/bottom, one down a side moves left/right. `auto` keeps the seeded position.
const imageAlignOptions = (
  axis: 'vertical' | 'horizontal',
): { value: GenImageAlign; icon: ReactNode; title: string }[] => {
  const [start, end] = axis === 'vertical' ? ['Top', 'Bottom'] : ['Left', 'Right']
  return [
    { value: 'auto', icon: <span className="text-xs font-bold">Auto</span>, title: 'Auto' },
    { value: 'start', icon: <ImageAlignIcon align="start" axis={axis} />, title: start },
    { value: 'middle', icon: <ImageAlignIcon align="middle" axis={axis} />, title: 'Middle' },
    { value: 'end', icon: <ImageAlignIcon align="end" axis={axis} />, title: end },
  ]
}

/** A colour chip followed by its name, sized to sit inside an IconChoice button. */
function SwatchLabel({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-4 w-4 shrink-0 border" style={{ background: colour }} />
      <span className="text-xs font-bold tracking-[-0.01em]">{label}</span>
    </span>
  )
}

/**
 * Add/remove/edit the secondary elements. Each element shows its text, a per-item
 * placement control (`mode`: half + corner position for split, align icons for
 * editorial, none otherwise) and a fitted/paragraph style toggle.
 */
function ParagraphList({
  items,
  onChange,
  mode,
}: {
  items: Paragraph[]
  onChange: (next: Paragraph[]) => void
  mode: 'position' | 'align' | 'none'
}) {
  const update = (i: number, patch: Partial<Paragraph>) =>
    onChange(items.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const add = () => onChange([...items, makeParagraph()])
  return (
    <div className="flex flex-col gap-2">
      {items.map((p, i) => (
        // Rule between items so each text block reads as its own group.
        <div key={i} className={CARD}>
          <TextField label="" value={p.text} onChange={(v) => update(i, { text: v })} multiline />
          <div className="flex flex-col gap-1   pb-1.5 mb-1 px-1">
          <Drawer label="Options">
            {mode === 'position' && (
              <>
                <IconChoice
                  label="Half"
                  cols={2}
                  value={p.half}
                  onChange={(v) => update(i, { half: v })}
                  options={HALF_OPTIONS}
                />
                <IconChoice
                  label="Position"
                  cols={2}
                  value={p.position}
                  onChange={(v) => update(i, { position: v })}
                  options={POSITION_OPTIONS}
                />
              </>
            )}
            {mode === 'align' && (
              <IconChoice
                label="Align"
                cols={3}
                value={p.side}
                onChange={(v) => update(i, { side: v })}
                options={ALIGN_OPTIONS}
              />
            )}
            <SegmentedDrawer
              label="Style"
              collapsible={false}
              value={p.style}
              onChange={(v) => update(i, { style: v })}
              options={STYLE_OPTIONS}
            />
            </Drawer>
          </div>
        </div>
      ))}
      <div className="flex flex-col w-full px-1">
      {items.length < MAX_PARAGRAPHS && (
        <button onClick={add} className={ADD_BTN}>
          + Add text
        </button>
      )}
    </div>
    </div>
  )
}

export function Controls() {
  const s = useCurrentState()
  const set = usePoster((st) => st.set)
  const setHalftone = usePoster((st) => st.setHalftone)
  const setImage = usePoster((st) => st.setImage)
  const applyCategory = usePoster((st) => st.applyCategory)
  const setPaperOpacity = usePoster((st) => st.setPaperOpacity)

  const setLayout = usePoster((st) => st.setLayout)
  const generateLayout = usePoster((st) => st.generateLayout)

  const presets = usePoster((st) => st.presets)
  const savePreset = usePoster((st) => st.savePreset)
  const applyPreset = usePoster((st) => st.applyPreset)
  const deletePreset = usePoster((st) => st.deletePreset)

  const logo = useImage(LOGO.src)
  const papers = usePaperImages()
  const placeholders = usePlaceholderImages()
  const [fmt, setFmt] = useState<ExportFormat>('png')
  const [scale, setScale] = useState(2)

  // Shared by the file picker and the drop target.
  const loadFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setImage(img)
    img.src = url
  }

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    loadFile(e.target.files?.[0])
    // Clear the input so re-picking the same file still fires a change event.
    e.target.value = ''
  }

  // Highlight the box only while a dragged file is over it. `dragDepth` counts
  // enter/leave pairs so moving across child nodes doesn't flicker the state off.
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  // A file dropped anywhere but the box would navigate the tab to it, discarding
  // every artboard (nothing is persisted). Swallow drops outside the drop target —
  // the label's own handler has already run by the time this fires.
  useEffect(() => {
    const swallow = (e: Event) => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }
  // Required: without preventDefault on dragover the browser refuses the drop.
  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    loadFile(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/')))
  }

  const [presetName, setPresetName] = useState('')
  const onSavePreset = () => {
    if (!presetName.trim()) return
    savePreset(presetName)
    setPresetName('')
  }

  const isSplit = s.layout === 'split'
  const isEditorial = s.layout === 'editorial'
  const isGenerative = s.layout === 'generative'
  // Editorial & centered treat the image as a full-bleed background (solid/image
  // toggle); split & generative use it as the foreground halftone.
  const hasBgMode = isEditorial || s.layout === 'centered'
  const showImageControls = !hasBgMode || s.bgMode === 'image'
  const secondaryMode = isSplit ? 'position' : isEditorial ? 'align' : 'none'

  // Which layout icon is highlighted. Generative slides light up Generate.
  const layoutValue: LayoutChoice = isGenerative ? 'generate' : (s.layout as LayoutChoice)

  const pickLayout = (v: LayoutChoice) => {
    // No slide type passed — the Colour control owns it, so reseeding keeps it.
    if (v === 'generate') generateLayout()
    else setLayout(v as LayoutId)
  }

  // Replay the seeded image draw so the position control is labelled for the axis
  // the generated band slides along. A full-bleed image has nowhere to move.
  const imageMode = planImage(mulberry32(s.seed || 1)).mode
  const imageAxis = imageAlignAxis(imageMode)
  const canMoveImage = imageMode !== 'full'

  // Primary/secondary only changes the generative outline colour, so the swatches
  // preview exactly what each choice paints.
  const palette = getPalette(s.paletteId)
  const COLOUR_OPTIONS: { value: SlideType; icon: ReactNode; title: string }[] = [
    { value: 'main', icon: <SwatchLabel colour={OUTLINE_COLOR} label="Primary" />, title: 'Primary' },
    {
      value: 'secondary',
      icon: <SwatchLabel colour={palette.secondaryBg} label="Secondary" />,
      title: 'Secondary',
    },
  ]

  return (
    <div className="flex h-full flex-col text-black">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
      <Section title="Format" collapsible>
        <Segmented value={s.aspect} onChange={(v) => set('aspect', v)} options={ASPECT_OPTIONS} />
        </Section>

        <Section title="Layout" collapsible defaultOpen>
          <IconChoice cols={4} value={layoutValue} onChange={pickLayout} options={LAYOUT_OPTIONS} />
          {isGenerative && (
            <Drawer label="Options">
              <IconChoice
                label="Alignment"
                cols={4}
                value={s.genAlign}
                onChange={(v) => set('genAlign', v)}
                options={GEN_ALIGN_OPTIONS}
              />
              <IconChoice
                label="Header Size"
                cols={4}
                value={s.genHeaderWidth}
                onChange={(v) => set('genHeaderWidth', v)}
                options={GEN_SIZE_OPTIONS}
              />
              {s.image && canMoveImage && (
                <IconChoice
                  label="Image"
                  cols={4}
                  value={s.genImageAlign}
                  onChange={(v) => set('genImageAlign', v)}
                  options={imageAlignOptions(imageAxis)}
                />
              )}
            </Drawer>
          )}
          <Drawer label="Presets">
            <Drawer label="Save current style">
              <div className="flex gap-2">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSavePreset()}
                  placeholder="Preset name"
                  className="min-w-0 flex-1 border border-black bg-white px-2 py-[7px] text-xs font-medium text-black outline-none placeholder:text-black/40 focus:ring-1 focus:ring-black"
                />
                <button onClick={onSavePreset} disabled={!presetName.trim()} className={SAVE_BTN}>
                  Save
                </button>
              </div>
            </Drawer>
            {presets.length === 0 ? (
              <div className="py-1 text-xs text-black/40">No presets saved yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {presets.map((p) => (
                  <div key={p.id} className="flex gap-2">
                    <button
                      onClick={() => applyPreset(p.id)}
                      title="Apply this style"
                      className="min-w-0 flex-1 truncate border border-black bg-white px-2 py-[7px] text-left text-xs font-bold text-black transition hover:bg-black/5"
                    >
                      {p.name}
                    </button>
                    <button
                      onClick={() => deletePreset(p.id)}
                      title={`Delete "${p.name}"`}
                      aria-label={`Delete preset ${p.name}`}
                      className="shrink-0 border border-black bg-white px-2 py-[7px] text-xs font-bold text-black/40 transition hover:bg-black/5 hover:text-black"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Drawer>
        </Section>

      <Section title="Category" collapsible defaultOpen>
        {!isEditorial && (
          <TextField label="" value={s.category} onChange={(v) => set('category', v)} />
        )}

          <div className="grid grid-cols-2 gap-2 px-1">

          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => applyCategory(p.id, placeholders[p.id] ?? null)}
              className={`flex items-center gap-1.5 border border-black px-2 py-[7px] text-left text-xs font-bold tracking-[-0.01em] transition ${
                s.paletteId === p.id
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-black/5'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 border"
                style={{ background: p.background }}
              />
              <span
                className="h-4 w-4 shrink-0 border"
                style={{ background: p.highlight }}
              />
              <span className="text-xs">{p.label}</span>
            </button>
          ))}
        </div>

      </Section>



      <Section
          title="Heading"
          collapsible

          action={
            <button onClick={() => set('header', '')} className={CLEAR_BTN}>
              Clear
            </button>
          }

        >
          <div className={CARD}>
            <div className="flex flex-col w-full gap-1 pb-1">
              <TextField label="" value={s.header} onChange={(v) => set('header', v)} multiline />
              <div className="flex flex-col w-full px-1 pb-1.5">
            <Drawer label="Options">
              <IconChoice
                label="Colour"
                cols={2}
                value={s.slideType}
                onChange={(v) => set('slideType', v)}
                options={COLOUR_OPTIONS}
              />
              {isSplit && (
                <IconChoice
                  label="Position"
                  cols={2}
                  value={s.textHalf}
                  onChange={(v) => set('textHalf', v)}
                  options={HALF_OPTIONS}
                />
              )}
              {s.layout === 'centered' && (
                <IconChoice
                  label="Header Size"
                  cols={2}
                  value={s.headerWidth}
                  onChange={(v) => set('headerWidth', v)}
                  options={HEADER_WIDTH_OPTIONS}
                />
              )}
              {isEditorial && (
                <>
                  <IconChoice
                    label="Alignment"
                    cols={3}
                    value={s.editorialHeaderAlign}
                    onChange={(v) => set('editorialHeaderAlign', v)}
                    options={ALIGN_OPTIONS}
                  />
                  <IconChoice
                    label="Header Size"
                    cols={3}
                    value={s.editorialHeaderSize}
                    onChange={(v) => set('editorialHeaderSize', v)}
                    options={EDITORIAL_SIZE_OPTIONS}
                  />
                </>
                )}

                </Drawer>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Secondary Text"

          collapsible
          action={
            <button onClick={() => set('paragraphs', [makeParagraph()])} className={CLEAR_BTN}>
              Clear
            </button>
          }
        >

          <ParagraphList
            items={s.paragraphs}
            onChange={(n) => set('paragraphs', n)}
            mode={secondaryMode}
          />
        </Section>

        <Section title={hasBgMode ? 'Background' : 'Image & Halftone'} collapsible>
          {hasBgMode && (
            <IconChoice

              cols={2}
              value={s.bgMode}
              onChange={(v) => set('bgMode', v)}
              options={BG_OPTIONS}
            />
          )}
          {showImageControls && (
            <>
              <label
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex cursor-pointer items-center justify-center border px-[10px] py-[30px] text-center text-xs font-bold transition ${
                  dragging
                    ? 'border-dashed border-black bg-black/5 text-black'
                    : 'border-black text-black hover:bg-black/5'
                }`}
              >
                {dragging
                  ? 'Drop image…'
                  : s.image
                    ? 'Replace image…'
                    : 'Upload or drop image…'}
                <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
              </label>
              {s.image && (
                <Drawer label="Advanced" padded>
                  <Slider label="Dot scale" min={3} max={40} value={s.halftone.dotScale} onChange={(v) => setHalftone('dotScale', v)} format={(v) => `${v}px`} />
                  <Slider label="Contrast" min={0.2} max={2.5} step={0.01} value={s.halftone.contrast} onChange={(v) => setHalftone('contrast', v)} format={(v) => v.toFixed(2)} />
                  <Slider label="Brightness" min={0.2} max={2} step={0.01} value={s.halftone.brightness} onChange={(v) => setHalftone('brightness', v)} format={(v) => v.toFixed(2)} />
                  <Slider label="Saturation" min={0} max={2} step={0.01} value={s.halftone.saturation} onChange={(v) => setHalftone('saturation', v)} format={(v) => v.toFixed(2)} />
                  <Slider label="Shadows" min={-1} max={1} step={0.01} value={s.halftone.shadows} onChange={(v) => setHalftone('shadows', v)} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100)} />
                  <Slider label="Highlights" min={-1} max={1} step={0.01} value={s.halftone.highlights} onChange={(v) => setHalftone('highlights', v)} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100)} />
                  <Slider label="Dot softness" min={0} max={1} step={0.01} value={s.halftone.sharpness} onChange={(v) => setHalftone('sharpness', v)} format={(v) => v.toFixed(2)} />
                </Drawer>
              )}
            </>
          )}
          {/* Paper textures apply with or without an image, so they sit outside
              the image-dependent controls above. */}
          <Drawer label="Texture Options" padded>
            {s.paperIds.map((id) => (
              <Slider
                key={id}
                label={`Opacity — ${getPaper(id).label}`}
                min={0}
                max={1}
                step={0.01}
                value={s.paperOpacities[id] ?? 0.4}
                onChange={(v) => setPaperOpacity(id, v)}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            ))}
          </Drawer>
        </Section>

      </div>

      <div className="mt-2 flex shrink-0 flex-col gap-2 border-t border-black/15 pt-2">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SegmentedDrawer
              label="Format"
              value={fmt}
              onChange={setFmt}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpg', label: 'JPG' },
              ]}
            />
          </div>
          <div className="min-w-0 flex-1">
            <SegmentedDrawer
              label="Resolution"
              value={String(scale)}
              onChange={(v) => setScale(Number(v))}
              options={[
                { value: '1', label: '1×' },
                { value: '2', label: '2×' },
              ]}
            />
          </div>
        </div>
        <button onClick={() => exportPoster(s, { logo, papers }, fmt, scale)} className={BTN_ON}>
          Export poster
        </button>
      </div>
    </div>
  )
}
