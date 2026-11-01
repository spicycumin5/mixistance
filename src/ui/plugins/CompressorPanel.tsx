import { useRef } from 'react'
import { staticCurve, type CompressorParams } from '../../dsp/compressorCore'
import { useRaf } from '../hooks'
import { Knob } from '../components/Knob'

interface Props {
  params: CompressorParams
  onChange: (p: Partial<CompressorParams>) => void
  /** Current gain reduction in dB (positive). */
  readGr: () => number
  /** Current input peak in dBFS, drawn as a dot on the transfer curve. */
  readInput?: () => number
}

const PRESETS: { name: string; tip: string; p: Partial<CompressorParams> }[] = [
  { name: 'Vocal level', tip: 'Medium attack keeps consonants, auto-ish release follows phrasing', p: { ratio: 3, attackMs: 8, releaseMs: 90, kneeDb: 6 } },
  { name: 'Drum punch', tip: 'Slow attack lets the transient through, fast release resets before the next hit', p: { ratio: 4, attackMs: 30, releaseMs: 60, kneeDb: 2 } },
  { name: 'Bus glue', tip: 'Low ratio, slow attack, 1-2 dB of GR: cohesion not squash', p: { ratio: 2, attackMs: 30, releaseMs: 200, kneeDb: 6 } },
  { name: 'Bass control', tip: 'Fast attack + high ratio evens out note-to-note level', p: { ratio: 6, attackMs: 3, releaseMs: 120, kneeDb: 4 } },
]

export function CompressorPanel({ params: p, onChange, readGr, readInput }: Props) {
  const graph = useRef<HTMLCanvasElement>(null)
  const grBar = useRef<HTMLDivElement>(null)
  const grText = useRef<HTMLSpanElement>(null)
  const grSmooth = useRef(0)
  const pRef = useRef(p)
  pRef.current = p

  useRaf(() => {
    const gr = readGr()
    grSmooth.current = Math.max(gr, grSmooth.current * 0.9)
    if (grBar.current) grBar.current.style.width = `${Math.min(1, grSmooth.current / 20) * 100}%`
    if (grText.current) grText.current.textContent = `-${grSmooth.current.toFixed(1)} dB`

    const c = graph.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const s = c.clientWidth
    if (c.width !== s * dpr) { c.width = s * dpr; c.height = s * dpr }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, s, s)
    const lo = -60
    const px = (db: number) => ((db - lo) / -lo) * s
    g.strokeStyle = '#24252c'
    for (let d = -48; d < 0; d += 12) {
      g.beginPath(); g.moveTo(px(d), 0); g.lineTo(px(d), s); g.moveTo(0, s - px(d)); g.lineTo(s, s - px(d)); g.stroke()
    }
    g.strokeStyle = '#3b3c47'
    g.setLineDash([3, 3])
    g.beginPath(); g.moveTo(0, s); g.lineTo(s, 0); g.stroke()
    g.setLineDash([])
    const cp = pRef.current
    g.strokeStyle = '#f5a524'
    g.lineWidth = 2
    g.beginPath()
    for (let x = 0; x <= s; x++) {
      const inDb = lo + (x / s) * -lo
      const y = s - px(staticCurve(inDb, cp))
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    g.stroke()
    g.lineWidth = 1
    // threshold marker
    g.strokeStyle = 'rgba(245,165,36,0.35)'
    g.beginPath(); g.moveTo(px(cp.thresholdDb), 0); g.lineTo(px(cp.thresholdDb), s); g.stroke()
    if (readInput) {
      const inDb = Math.max(lo, readInput())
      g.beginPath()
      g.arc(px(inDb), s - px(staticCurve(inDb, cp)), 4, 0, Math.PI * 2)
      g.fillStyle = '#f3f1ec'
      g.fill()
    }
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4">
        <canvas ref={graph} className="aspect-square w-36 shrink-0 rounded-md border border-line bg-[#111216]" title="Transfer curve: input level (x) vs output level (y)" />
        <div className="grid flex-1 grid-cols-3 gap-x-2 gap-y-3">
          <Knob label="Threshold" min={-60} max={0} defaultValue={-18} value={p.thresholdDb} step={0.5} format={(v) => `${v.toFixed(1)}`} onChange={(v) => onChange({ thresholdDb: v })} />
          <Knob label="Ratio" log min={1} max={20} defaultValue={4} value={p.ratio} format={(v) => (v >= 19.5 ? '∞:1' : `${v.toFixed(1)}:1`)} onChange={(v) => onChange({ ratio: v })} />
          <Knob label="Knee" min={0} max={18} defaultValue={6} value={p.kneeDb} step={0.5} format={(v) => `${v.toFixed(1)}`} onChange={(v) => onChange({ kneeDb: v })} />
          <Knob label="Attack" log min={0.1} max={150} defaultValue={10} value={p.attackMs} format={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}ms`} onChange={(v) => onChange({ attackMs: v })} />
          <Knob label="Release" log min={10} max={2000} defaultValue={120} value={p.releaseMs} format={(v) => `${Math.round(v)}ms`} onChange={(v) => onChange({ releaseMs: v })} />
          <Knob label="Makeup" min={0} max={24} defaultValue={0} value={p.makeupDb} step={0.5} format={(v) => `+${v.toFixed(1)}`} onChange={(v) => onChange({ makeupDb: v })} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-dim">
          <span>Gain reduction</span>
          <span ref={grText} className="readout text-ink" />
        </div>
        <div className="h-2 overflow-hidden rounded bg-black/60">
          <div ref={grBar} className="h-full bg-amber transition-[width] duration-75" />
        </div>
        <div className="readout mt-0.5 flex justify-between text-[9px] text-dim">
          <span>0</span><span>-5</span><span>-10</span><span>-15</span><span>-20</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((pr) => (
          <button key={pr.name} className="btn !px-2 !py-1 !text-xs" title={pr.tip} onClick={() => onChange(pr.p)}>
            {pr.name}
          </button>
        ))}
      </div>
    </div>
  )
}
