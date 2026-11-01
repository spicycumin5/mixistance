import { useRef } from 'react'
import type { LevelProbe } from '../../audio/analysis'
import { bandMagnitudeDb, curveDb, type EqBand } from '../../dsp/biquad'
import { fmtHz } from '../format'
import { useRaf } from '../hooks'
import { Knob } from '../components/Knob'

const F_LO = 20
const F_HI = 20000
const DB_RANGE = 18
const BAND_COLORS = ['#94a3b8', '#f97316', '#eab308', '#22d3ee', '#a78bfa', '#94a3b8']
const BAND_LABELS = ['HPF', 'Low', 'Lo-Mid', 'Hi-Mid', 'High', 'LPF']

interface Props {
  bands: EqBand[]
  onBand: (i: number, p: Partial<EqBand>) => void
  /** Live signal probes: pre-EQ (faint) and post (bright). */
  pre?: LevelProbe
  post?: LevelProbe
  /** Optional ghost curve, e.g. a lesson target. */
  ghost?: EqBand[]
  height?: number
  compact?: boolean
}

export function EQPanel({ bands, onBand, pre, post, ghost, height = 220, compact }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<number | null>(null)
  const bandsRef = useRef(bands)
  bandsRef.current = bands

  const xOf = (f: number, w: number) => (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * w
  const fOf = (x: number, w: number) => F_LO * Math.pow(F_HI / F_LO, x / w)
  const yOf = (db: number, h: number) => h / 2 - (db / DB_RANGE) * (h / 2 - 8)
  const dbOf = (y: number, h: number) => ((h / 2 - y) / (h / 2 - 8)) * DB_RANGE
  const nodeY = (b: EqBand) => (b.type === 'highpass' || b.type === 'lowpass' ? 0 : b.gainDb)

  useRaf(() => {
    const c = canvas.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = c.clientHeight
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)

    // grid
    g.strokeStyle = '#2a2b33'
    g.fillStyle = '#5c5b66'
    g.font = '10px IBM Plex Mono'
    g.lineWidth = 1
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = Math.round(xOf(f, w)) + 0.5
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke()
      g.fillText(fmtHz(f), x + 3, h - 4)
    }
    for (const d of [-12, -6, 0, 6, 12]) {
      const y = Math.round(yOf(d, h)) + 0.5
      g.strokeStyle = d === 0 ? '#3b3c47' : '#24252c'
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke()
      g.fillText(`${d > 0 ? '+' : ''}${d}`, 3, y - 2)
    }

    // spectra
    const drawSpec = (probe: LevelProbe, fill: string, stroke: string) => {
      const spec = probe.spectrum()
      const bin = probe.binHz()
      g.beginPath()
      g.moveTo(0, h)
      for (let x = 0; x <= w; x += 2) {
        const f0 = fOf(x, w), f1 = fOf(x + 2, w)
        let m = -140
        for (let i = Math.floor(f0 / bin); i <= Math.ceil(f1 / bin) && i < spec.length; i++) m = Math.max(m, spec[i])
        // tilt +4.5 dB/oct so pink-ish program reads flat, like most pro analyzers
        const tilt = 4.5 * Math.log2(f0 / 1000)
        const y = h - ((m + tilt + 90) / 84) * h
        g.lineTo(x, Math.min(h, Math.max(0, y)))
      }
      g.lineTo(w, h)
      g.closePath()
      g.fillStyle = fill
      g.fill()
      g.strokeStyle = stroke
      g.stroke()
    }
    if (pre) drawSpec(pre, 'rgba(120,120,140,0.10)', 'rgba(140,140,160,0.25)')
    if (post) drawSpec(post, 'rgba(245,165,36,0.12)', 'rgba(245,165,36,0.35)')

    const curve = (bs: EqBand[], style: string, width: number, dash: number[] = []) => {
      g.beginPath()
      for (let x = 0; x <= w; x += 2) {
        const y = yOf(curveDb(bs, fOf(x, w)), h)
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
      }
      g.setLineDash(dash)
      g.strokeStyle = style
      g.lineWidth = width
      g.stroke()
      g.setLineDash([])
      g.lineWidth = 1
    }
    if (ghost) curve(ghost, 'rgba(74,222,128,0.8)', 1.5, [5, 4])

    // per-band fills
    const bs = bandsRef.current
    bs.forEach((b, i) => {
      if (!b.enabled || drag.current !== i) return
      g.beginPath()
      g.moveTo(0, yOf(0, h))
      for (let x = 0; x <= w; x += 3) g.lineTo(x, yOf(bandMagnitudeDb(b, fOf(x, w)), h))
      g.lineTo(w, yOf(0, h))
      g.fillStyle = BAND_COLORS[i] + '33'
      g.fill()
    })
    curve(bs, '#f3f1ec', 2)

    bs.forEach((b, i) => {
      const x = xOf(b.freq, w)
      const y = yOf(nodeY(b), h)
      g.beginPath()
      g.arc(x, y, drag.current === i ? 8 : 6, 0, Math.PI * 2)
      g.fillStyle = b.enabled ? BAND_COLORS[i] : '#3f3f46'
      g.fill()
      g.strokeStyle = '#0f1013'
      g.lineWidth = 2
      g.stroke()
      g.lineWidth = 1
      g.fillStyle = '#0f1013'
      g.font = 'bold 9px IBM Plex Sans'
      g.textAlign = 'center'
      g.fillText(String(i + 1), x, y + 3)
      g.textAlign = 'left'
    })
  })

  const hit = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    let best = -1
    let bestD = 18
    bandsRef.current.forEach((b, i) => {
      const d = Math.hypot(xOf(b.freq, r.width) - x, yOf(nodeY(b), r.height) - y)
      if (d < bestD) { bestD = d; best = i }
    })
    return { best, x, y, r }
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        className="w-full cursor-crosshair touch-none rounded-md border border-line bg-[#111216]"
        style={{ height }}
        onPointerDown={(e) => {
          const { best } = hit(e)
          if (best < 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = best
          if (!bandsRef.current[best].enabled) onBand(best, { enabled: true })
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return
          const { x, y, r } = hit(e)
          const i = drag.current
          const b = bandsRef.current[i]
          const freq = Math.round(Math.min(F_HI, Math.max(F_LO, fOf(x, r.width))))
          const gainDb = Math.round(Math.max(-DB_RANGE, Math.min(DB_RANGE, dbOf(y, r.height))) * 10) / 10
          onBand(i, b.type === 'highpass' || b.type === 'lowpass' ? { freq } : { freq, gainDb })
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          const { best } = hit(e as unknown as React.PointerEvent<HTMLCanvasElement>)
          if (best < 0) return
          const b = bandsRef.current[best]
          onBand(best, { q: Math.round(Math.min(10, Math.max(0.3, b.q * (e.deltaY > 0 ? 0.9 : 1.1))) * 100) / 100 })
        }}
        onDoubleClick={(e) => {
          const { best } = hit(e as unknown as React.PointerEvent<HTMLCanvasElement>)
          if (best >= 0) onBand(best, { gainDb: 0 })
        }}
      />
      {!compact && (
        <div className="grid grid-cols-6 gap-1">
          {bands.map((b, i) => {
            const isFilter = b.type === 'highpass' || b.type === 'lowpass'
            return (
              <div key={i} className={`flex flex-col items-center gap-1 rounded-md border border-line p-1.5 ${b.enabled ? '' : 'opacity-50'}`}>
                <button
                  className="chip w-full"
                  style={{ background: b.enabled ? BAND_COLORS[i] : 'var(--color-panel-3)', color: b.enabled ? '#0f1013' : 'var(--color-dim)' }}
                  onClick={() => onBand(i, { enabled: !b.enabled })}
                >
                  {BAND_LABELS[i]}
                </button>
                <Knob size={34} label="Freq" log min={20} max={20000} value={b.freq} format={fmtHz} color={BAND_COLORS[i]} onChange={(v) => onBand(i, { freq: Math.round(v) })} />
                {!isFilter && (
                  <Knob size={34} label="Gain" min={-18} max={18} defaultValue={0} value={b.gainDb} step={0.1} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`} color={BAND_COLORS[i]} onChange={(v) => onBand(i, { gainDb: v })} />
                )}
                {(b.type === 'peaking' || isFilter) && (
                  <Knob size={34} label="Q" log min={0.3} max={10} defaultValue={b.type === 'peaking' ? 1.2 : 0.707} value={b.q} format={(v) => v.toFixed(2)} color={BAND_COLORS[i]} onChange={(v) => onBand(i, { q: v })} />
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[11px] text-dim">Drag nodes to move · scroll on a node for Q · double-click to flatten · knobs: shift-drag for fine</p>
    </div>
  )
}
