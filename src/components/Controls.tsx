import { useState, type ChangeEvent, type ReactNode } from 'react'
import { ASPECTS, LOGO, MAX_PARAGRAPHS } from '../config/constants'
import { PALETTES } from '../config/palettes'
import { getPaper } from '../config/papers'
import { exportPoster, type ExportFormat } from '../render/export'
import { useImage } from '../hooks/useImage'
import { usePaperImages } from '../hooks/usePaperImages'
import { usePlaceholderImages } from '../hooks/usePlaceholderImages'
import { makeParagraph, usePoster, useCurrentState } from '../store/usePoster'
import type {
  CenteredLabelPos,
  EditorialHeaderSize,
  GenAlign,
  GenHeaderWidth,
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
  LabelPosIcon,
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
const BTN_OFF = `${BTN} bg-white text-black hover:bg-black/5`

// Subtle text button sitting across from a section title (e.g. "Clear").
const CLEAR_BTN = 'px-2 font-review text-xs uppercase text-black/40 transition hover:text-black'

// Subtle card wrapper shared by the Header block and each secondary text item.
const CARD = 'flex flex-col gap-2 border border-black/15 bg-black/[0.02] p-2.5'

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

const SLIDE_TAB_OPTIONS: { value: SlideType; label: string }[] = [
  { value: 'main', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
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

// Layout options grouped by slide role. `generate` is a virtual value handled by
// the picker (it triggers generateLayout for that slide type).
type MainLayout = 'split' | 'centered' | 'generate'
type SecondaryLayout = 'editorial' | 'generate'

const MAIN_LAYOUT_OPTIONS: { value: MainLayout; icon: ReactNode; title: string }[] = [
  { value: 'split', icon: <LayoutIcon layout="split" />, title: 'Split' },
  { value: 'centered', icon: <LayoutIcon layout="centered" />, title: 'Centered' },
  { value: 'generate', icon: <LayoutIcon layout="generate" />, title: 'Generate' },
]

const SECONDARY_LAYOUT_OPTIONS: { value: SecondaryLayout; icon: ReactNode; title: string }[] = [
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

const LABEL_POS_OPTIONS: { value: CenteredLabelPos; icon: ReactNode; title: string }[] = [
  { value: 'top', icon: <LabelPosIcon pos="top" />, title: 'Top centre' },
  { value: 'above', icon: <LabelPosIcon pos="above" />, title: 'Above text' },
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
    <div className="flex flex-col gap-3">
      {items.map((p, i) => (
        <div key={i} className={CARD}>
          <TextField label="" value={p.text} onChange={(v) => update(i, { text: v })} multiline />
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
        </div>
      ))}
      {items.length < MAX_PARAGRAPHS && (
        <button onClick={add} className={BTN_OFF}>
          + Add text
        </button>
      )}
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

  const logo = useImage(LOGO.src)
  const papers = usePaperImages()
  const placeholders = usePlaceholderImages()
  const [fmt, setFmt] = useState<ExportFormat>('png')
  const [scale, setScale] = useState(2)

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setImage(img)
    img.src = url
  }

  const isSplit = s.layout === 'split'
  const isEditorial = s.layout === 'editorial'
  const isGenerative = s.layout === 'generative'
  // Editorial & centered treat the image as a full-bleed background (solid/image
  // toggle); split & generative use it as the foreground halftone.
  const hasBgMode = isEditorial || s.layout === 'centered'
  const showImageControls = !hasBgMode || s.bgMode === 'image'
  const secondaryMode = isSplit ? 'position' : isEditorial ? 'align' : 'none'

  // Which icon is highlighted in each layout group. Generative slides light up the
  // Generate icon in the group matching their slide type; the other group is blank.
  const mainValue: MainLayout | '' = isSplit
    ? 'split'
    : s.layout === 'centered'
      ? 'centered'
      : isGenerative && s.slideType === 'main'
        ? 'generate'
        : ''
  const secondaryValue: SecondaryLayout | '' = isEditorial
    ? 'editorial'
    : isGenerative && s.slideType === 'secondary'
      ? 'generate'
      : ''

  // The generative Edit panel opens automatically whenever a layout is generated.
  const [editOpen, setEditOpen] = useState(false)

  const pickMain = (v: MainLayout | '') => {
    if (v === 'generate') {
      generateLayout('main')
      setEditOpen(true)
    } else if (v) setLayout(v as LayoutId)
  }
  const pickSecondary = (v: SecondaryLayout | '') => {
    if (v === 'generate') {
      generateLayout('secondary')
      setEditOpen(true)
    } else if (v) setLayout('editorial')
  }

  // The Layout "Type" toggle. For a generative slide it doubles as the slide-type
  // selector (recolours without reseeding); otherwise it's a local view toggle to
  // browse the other type's layout options.
  const [layoutTab, setLayoutTab] = useState<SlideType>(secondaryValue ? 'secondary' : 'main')
  const activeTab: SlideType = isGenerative ? s.slideType : layoutTab
  const onTabChange = (t: SlideType) => {
    setLayoutTab(t)
    if (isGenerative) set('slideType', t)
  }

  return (
    <div className="flex h-full flex-col text-black">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
      <Section title="Format" collapsible defaultOpen>
        <Segmented value={s.aspect} onChange={(v) => set('aspect', v)} options={ASPECT_OPTIONS} />
      </Section>

      <Section title="Category" collapsible defaultOpen>
        <div className="font-review text-xs uppercase text-black">Type</div>
        <div className="grid grid-cols-2 gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => applyCategory(p.id, placeholders[p.id] ?? null)}
              className={`flex items-center gap-1.5 border border-black px-2 py-[7px] text-left text-xs font-bold uppercase transition ${
                s.paletteId === p.id
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-black/5'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border"
                style={{ background: p.background }}
              />
              <span
                className="h-4 w-4 shrink-0 rounded-full border"
                style={{ background: p.highlight }}
              />
              <span className="text-xs">{p.label}</span>
            </button>
          ))}
        </div>
        {!isEditorial && (
          <TextField label="Label" value={s.category} onChange={(v) => set('category', v)} />
        )}
        {s.layout === 'centered' && (
          <IconChoice
            label="Label position"
            cols={2}
            value={s.centeredLabelPos}
            onChange={(v) => set('centeredLabelPos', v)}
            options={LABEL_POS_OPTIONS}
          />
        )}
      </Section>

      <Section title="Layout" collapsible defaultOpen>
        <SegmentedDrawer
          label="Type"
          collapsible={false}
          value={activeTab}
          onChange={onTabChange}
          options={SLIDE_TAB_OPTIONS}
        />
        {activeTab === 'main' ? (
          <IconChoice
            label="Style"
            cols={3}
            value={mainValue}
            onChange={pickMain}
            options={MAIN_LAYOUT_OPTIONS}
          />
        ) : (
          <IconChoice
            label="Style"
            cols={2}
            value={secondaryValue}
            onChange={pickSecondary}
            options={SECONDARY_LAYOUT_OPTIONS}
          />
        )}
      </Section>

      {isGenerative && (
        <Section title="Edit" collapsible open={editOpen} onOpenChange={setEditOpen}>
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
        </Section>
      )}

      <Section title={hasBgMode ? 'Background' : 'Image & Halftone'} collapsible>
        {hasBgMode && (
          <IconChoice
            label="Background"
            cols={2}
            value={s.bgMode}
            onChange={(v) => set('bgMode', v)}
            options={BG_OPTIONS}
          />
        )}
        {showImageControls && (
          <>
            <label className="flex cursor-pointer items-center justify-center border border-black px-[10px] py-[30px] text-xs font-bold text-black transition hover:bg-black/5">
              {s.image ? 'Replace image…' : 'Upload image…'}
              <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
            </label>
            {s.image && (
              <Drawer label="Advanced">
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
      </Section>

      <Section title="Content" collapsible defaultOpen>
        <Section
          title="Header"
          sub
          collapsible
          action={
            <button onClick={() => set('header', '')} className={CLEAR_BTN}>
              Clear
            </button>
          }
        >
          <div className={CARD}>
            <TextField label="" value={s.header} onChange={(v) => set('header', v)} multiline />
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
          </div>
        </Section>

        <Section
          title="Text"
          sub
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
      </Section>

      <Section title="Textures" collapsible>
        <Drawer label="Advanced">
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
