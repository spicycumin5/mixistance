// Canvas plots for the processor labs. Each redraws when its inputs change. They are
// not animated, apart from the playhead overlay in LabShell.

import { useEffect, useRef, useState } from 'react'
import type { CurveSpec, IrSpec, Lane, LevelLine, SpectrumSpec, Zone } from '../../lab/types'

export interface View { t0: number; t1: number }

const C = {
  bg: '#111216', grid: '#24252c', axis: '#4a4b57', text: '#8b8a93', ink: '#e8e6e1',
  dry: 'rgba(139,138,147,0.55)', wet: '#f5a524', hl: '#fde68a', zone: 'rgba(253,230,138,0.13)',
}

export const isActive = (tag: string | undefined, active: string | null) =>
  !!tag && !!active && tag.split('|').includes(active)

/** Tracks an element's CSS width. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function prep(c: HTMLCanvasElement | null, w: number, h: number) {
  if (!c || w <= 0) return null
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  g.fillStyle = C.bg
  g.fillRect(0, 0, w, h)
  g.font = '10px "IBM Plex Mono", monospace'
  return g
}

/** Per-pixel-column min/max (or polyline when zoomed past 1 sample per pixel). */
function drawSignal(
  g: CanvasRenderingContext2D, x: Float32Array, fs: number, view: View, w: number,
  yOf: (v: number) => number, mode: 'minmax' | 'absmax', fill: string, stroke?: string,
) {
  const s0 = view.t0 * fs
  const spp = ((view.t1 - view.t0) * fs) / w
  if (spp < 1.5) {
    g.strokeStyle = stroke ?? fill
    g.lineWidth = 1.5
    g.beginPath()
    const a = Math.max(0, Math.floor(s0)), b = Math.min(x.length - 1, Math.ceil(view.t1 * fs))
    for (let i = a; i <= b; i++) {
      const px = (i - s0) / spp
      const v = mode === 'absmax' ? Math.abs(x[i]) : x[i]
      i === a ? g.moveTo(px, yOf(v)) : g.lineTo(px, yOf(v))
    }
    g.stroke()
    return
  }
  g.fillStyle = fill
  for (let px = 0; px < w; px++) {
    const a = Math.max(0, Math.floor(s0 + px * spp)), b = Math.min(x.length, Math.floor(s0 + (px + 1) * spp))
    if (a >= b) continue
    let lo = Infinity, hi = -Infinity
    for (let i = a; i < b; i++) { const v = x[i]; if (v < lo) lo = v; if (v > hi) hi = v }
    if (mode === 'absmax') {
      const m = Math.max(Math.abs(lo), Math.abs(hi))
      const y = yOf(m)
      g.fillRect(px, y, 1, yOf(0) - y)
    } else {
      const y1 = yOf(hi), y2 = yOf(lo)
      g.fillRect(px, y1, 1, Math.max(1, y2 - y1))
    }
  }
}

const DB_FLOOR = -72

export function WaveformPlot({ dry, wet, fs, view, scale, levelLines = [], zones = [], active, height = 190 }: {
  dry: Float32Array; wet: Float32Array; fs: number; view: View; scale: 'lin' | 'db'
  levelLines?: LevelLine[]; zones?: Zone[]; active: string | null; height?: number
}) {
  const [wrap, w] = useWidth<HTMLDivElement>()
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const h = height
    const g = prep(cv.current, w, h)
    if (!g) return
    const tx = (t: number) => ((t - view.t0) / (view.t1 - view.t0)) * w
    // Zones (only while their control is active)
    g.fillStyle = C.zone
    for (const z of zones) {
      if (!isActive(z.highlight, active) || z.t1 < view.t0 || z.t0 > view.t1) continue
      g.fillRect(tx(z.t0), 0, Math.max(1, tx(z.t1) - tx(z.t0)), h)
    }
    const pad = 6
    let yOf: (v: number) => number
    let mode: 'minmax' | 'absmax'
    if (scale === 'lin') {
      const mid = h / 2
      yOf = (v) => mid - v * (mid - pad)
      mode = 'minmax'
      g.strokeStyle = C.grid
      g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke()
    } else {
      const ydb = (d: number) => pad + (Math.max(DB_FLOOR, Math.min(0, d)) / DB_FLOOR) * (h - 2 * pad)
      yOf = (v) => ydb(20 * Math.log10(Math.max(Math.abs(v), 1e-9)))
      mode = 'absmax'
      g.fillStyle = C.text
      for (let d = -12; d > DB_FLOOR; d -= 12) {
        g.strokeStyle = C.grid
        g.beginPath(); g.moveTo(0, ydb(d)); g.lineTo(w, ydb(d)); g.stroke()
        g.fillText(`${d}`, 2, ydb(d) - 2)
      }
    }
    drawSignal(g, dry, fs, view, w, yOf, mode, C.dry, '#8b8a93')
    g.globalAlpha = 0.85
    drawSignal(g, wet, fs, view, w, yOf, mode, C.wet)
    g.globalAlpha = 1
    // Level lines
    for (const l of levelLines) {
      const on = isActive(l.highlight, active)
      const a = Math.pow(10, l.db / 20)
      g.strokeStyle = on ? C.hl : l.color ?? 'rgba(232,230,225,0.45)'
      g.lineWidth = on ? 2 : 1
      g.setLineDash([5, 4])
      const ys = scale === 'lin' ? [yOf(a), yOf(-a)] : [yOf(a)]
      for (const y of ys) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
      g.setLineDash([])
      g.lineWidth = 1
      g.fillStyle = on ? C.hl : C.text
      g.fillText(`${l.label} ${l.db.toFixed(1)} dB`, w - 120, ys[0] - 3)
    }
  }, [dry, wet, fs, view, scale, levelLines, zones, active, w, height])
  return (
    <div ref={wrap} className="w-full">
      <canvas ref={cv} style={{ width: '100%', height }} className="block rounded-t-md" />
    </div>
  )
}

export function LanePlot({ lane, fs, view, active }: { lane: Lane; fs: number; view: View; active: string | null }) {
  const [wrap, w] = useWidth<HTMLDivElement>()
  const cv = useRef<HTMLCanvasElement>(null)
  const h = lane.kind === 'gain' ? 58 : 50
  const on = isActive(lane.highlight, active)
  useEffect(() => {
    const g = prep(cv.current, w, h)
    if (!g) return
    const color = lane.color ?? C.wet
    if (lane.kind === 'wave') {
      let m = 1e-6
      for (let i = 0; i < lane.data.length; i++) m = Math.max(m, Math.abs(lane.data[i]))
      const mid = h / 2
      drawSignal(g, lane.data, fs, view, w, (v) => mid - (v / m) * (mid - 3), 'minmax', color)
    } else {
      let deepest = 0
      for (let i = 0; i < lane.data.length; i++) deepest = Math.min(deepest, lane.data[i])
      const range = lane.rangeDb ?? Math.max(6, Math.min(80, Math.ceil((-deepest + 1) / 3) * 3))
      const top = 12
      const yOf = (d: number) => top + (Math.min(range, Math.max(0, -d)) / range) * (h - top - 3)
      g.strokeStyle = C.grid
      for (const f of [0.5, 1]) {
        const y = yOf(-range * f)
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke()
      }
      // Fill from 0 dB down to the gain trace (deepest per column).
      g.fillStyle = color
      g.globalAlpha = 0.75
      const s0 = view.t0 * fs
      const spp = ((view.t1 - view.t0) * fs) / w
      for (let px = 0; px < w; px++) {
        const a = Math.max(0, Math.floor(s0 + px * spp)), b = Math.min(lane.data.length, Math.max(a + 1, Math.floor(s0 + (px + 1) * spp)))
        let d = 0
        for (let i = a; i < b; i++) d = Math.min(d, lane.data[i])
        g.fillRect(px, top, 1, yOf(d) - top)
      }
      g.globalAlpha = 1
      g.fillStyle = C.text
      g.fillText(`-${range} dB`, w - 44, h - 5)
      g.fillText(`max -${(-deepest).toFixed(1)} dB`, w - 160, 10)
    }
    g.fillStyle = on ? C.hl : C.text
    g.fillText(lane.label, 4, 10)
    if (on) {
      g.strokeStyle = C.hl
      g.strokeRect(0.5, 0.5, w - 1, h - 1)
    }
  }, [lane, fs, view, w, h, on])
  return (
    <div ref={wrap} className="w-full border-t border-line">
      <canvas ref={cv} style={{ width: '100%', height: h }} className="block" />
    </div>
  )
}

export function TransferCurvePlot({ spec, active }: { spec: CurveSpec; active: string | null }) {
  const [wrap, w] = useWidth<HTMLDivElement>()
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const s = w
    const g = prep(cv.current, s, s)
    if (!g) return
    const m = 24 // left/bottom margin for labels
    const size = s - m - 6
    const { lo, hi } = spec
    const px = (v: number) => m + ((v - lo) / (hi - lo)) * size
    const py = (v: number) => 6 + size - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * size
    // Grid
    g.strokeStyle = C.grid
    g.fillStyle = C.text
    const step = spec.unit === 'dB' ? (hi - lo > 60 ? 20 : 12) : 0.5
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      g.beginPath(); g.moveTo(px(v), 6); g.lineTo(px(v), 6 + size); g.moveTo(m, py(v)); g.lineTo(m + size, py(v)); g.stroke()
      const label = spec.unit === 'dB' ? `${v}` : v.toFixed(1)
      g.fillText(label, px(v) - 8, s - 4)
      g.fillText(label, 0, py(v) + 3)
    }
    // Zones
    for (const z of spec.zones ?? []) {
      g.fillStyle = isActive(z.highlight, active) ? 'rgba(253,230,138,0.22)' : 'rgba(245,165,36,0.07)'
      g.fillRect(px(z.x0), 6, px(z.x1) - px(z.x0), size)
    }
    for (const v of spec.vlines ?? []) {
      const on = isActive(v.highlight, active)
      g.strokeStyle = on ? C.hl : 'rgba(245,165,36,0.35)'
      g.lineWidth = on ? 2 : 1
      g.beginPath(); g.moveTo(px(v.x), 6); g.lineTo(px(v.x), 6 + size); g.stroke()
      g.fillStyle = on ? C.hl : C.text
      g.fillText(v.label, px(v.x) + 3, 16)
    }
    for (const hl of spec.hlines ?? []) {
      const on = isActive(hl.highlight, active)
      g.strokeStyle = on ? C.hl : 'rgba(232,230,225,0.3)'
      g.lineWidth = on ? 2 : 1
      g.setLineDash([4, 3])
      g.beginPath(); g.moveTo(m, py(hl.y)); g.lineTo(m + size, py(hl.y)); g.stroke()
      g.setLineDash([])
      if (hl.label) { g.fillStyle = on ? C.hl : C.text; g.fillText(hl.label, m + 4, py(hl.y) - 3) }
    }
    g.lineWidth = 1
    // Lines
    g.save()
    g.beginPath(); g.rect(m, 6, size, size); g.clip()
    for (const l of spec.lines) {
      const on = isActive(l.highlight, active)
      if (l.onlyActive && !on) continue
      g.strokeStyle = on && !l.onlyActive ? C.hl : l.color
      g.lineWidth = (l.width ?? 1.5) + (on && !l.onlyActive ? 1 : 0)
      g.setLineDash(l.dash ?? [])
      g.beginPath()
      const a = Math.max(lo, l.from ?? lo), b = Math.min(hi, l.to ?? hi)
      let first = true
      for (let x = px(a); x <= px(b) + 0.5; x += 1) {
        const v = lo + ((x - m) / size) * (hi - lo)
        const y = py(l.fn(v))
        first ? g.moveTo(x, y) : g.lineTo(x, y)
        first = false
      }
      g.stroke()
    }
    g.restore()
    g.setLineDash([])
    g.lineWidth = 1
    g.strokeStyle = C.axis
    g.strokeRect(m + 0.5, 6.5, size, size)
  }, [spec, active, w])
  const legend = spec.lines.filter((l) => l.label)
  return (
    <div>
      <div className="mb-1 text-[10px] text-dim">{spec.title}</div>
      <div ref={wrap} className="w-full">
        <canvas ref={cv} style={{ width: '100%', height: w }} className="block rounded-md" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-dim">
        <span>x: {spec.xLabel}</span><span>y: {spec.yLabel}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-dim">
        {legend.map((l, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3" style={{ background: l.color }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

const F_LO = 20, F_HI = 20000

export function SpectrumPlot({ spec, active, height = 170 }: { spec: SpectrumSpec; active: string | null; height?: number }) {
  const [wrap, w] = useWidth<HTMLDivElement>()
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const h = height
    const g = prep(cv.current, w, h)
    if (!g) return
    const fx = (f: number) => (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * w
    const ff = (x: number) => F_LO * Math.pow(F_HI / F_LO, x / w)
    // Resample to one value per pixel (max for harmonics, mean power for smooth).
    const toPx = (s: Float32Array) => {
      const out = new Float32Array(w)
      for (let x = 0; x < w; x++) {
        let f0 = ff(x), f1 = ff(x + 1)
        if (spec.smooth) { const c = Math.sqrt(f0 * f1); f0 = c / Math.pow(2, 1 / 8); f1 = c * Math.pow(2, 1 / 8) }
        const a = Math.max(1, Math.floor(f0 / spec.binHz)), b = Math.min(s.length - 1, Math.max(a, Math.ceil(f1 / spec.binHz)))
        let v = -200, p = 0
        for (let k = a; k <= b; k++) { v = Math.max(v, s[k]); p += Math.pow(10, s[k] / 10) }
        out[x] = spec.smooth ? 10 * Math.log10(p / (b - a + 1) + 1e-14) : v
      }
      return out
    }
    const dry = toPx(spec.dry), wet = toPx(spec.wet)
    let top = -200
    for (let x = 0; x < w; x++) top = Math.max(top, dry[x], wet[x])
    top = Math.ceil(top / 6) * 6 + 3
    const range = 84
    const py = (d: number) => 4 + ((top - Math.max(top - range, d)) / range) * (h - 18)
    // Grid
    g.strokeStyle = C.grid
    g.fillStyle = C.text
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      g.beginPath(); g.moveTo(fx(f), 0); g.lineTo(fx(f), h - 14); g.stroke()
      g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, fx(f) - 8, h - 3)
    }
    // Overlays (band gains on their own scale: 0 dB near the top, -36 dB at the bottom)
    for (const o of spec.overlays ?? []) {
      const on = isActive(o.highlight, active)
      const oy = (d: number) => 14 + (Math.min(36, Math.max(0, -d)) / 36) * (h - 30)
      g.beginPath()
      g.moveTo(0, oy(-36))
      for (let x = 0; x < w; x++) g.lineTo(x, oy(o.fn(ff(x))))
      g.lineTo(w, oy(-36))
      g.closePath()
      g.fillStyle = o.color + (on ? '40' : '1c')
      g.fill()
      g.strokeStyle = o.color
      g.lineWidth = on ? 2 : 1
      g.beginPath()
      for (let x = 0; x < w; x++) x ? g.lineTo(x, oy(o.fn(ff(x)))) : g.moveTo(x, oy(o.fn(ff(x))))
      g.stroke()
      g.lineWidth = 1
    }
    const line = (d: Float32Array, color: string, width: number) => {
      g.strokeStyle = color
      g.lineWidth = width
      g.beginPath()
      for (let x = 0; x < w; x++) x ? g.lineTo(x, py(d[x])) : g.moveTo(x, py(d[x]))
      g.stroke()
      g.lineWidth = 1
    }
    line(dry, 'rgba(139,138,147,0.8)', 1)
    line(wet, C.wet, 1.5)
    for (const mk of spec.markers ?? []) {
      const on = isActive(mk.highlight, active)
      g.strokeStyle = on ? C.hl : 'rgba(232,230,225,0.25)'
      g.setLineDash([3, 3])
      g.beginPath(); g.moveTo(fx(mk.freq), 0); g.lineTo(fx(mk.freq), h - 14); g.stroke()
      g.setLineDash([])
      g.fillStyle = on ? C.hl : C.text
      g.fillText(mk.label, fx(mk.freq) + 3, 12)
    }
  }, [spec, active, w, height])
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-dim">
        <span>{spec.title}</span>
        <span className="flex gap-3 normal-case tracking-normal">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-[#8b8a93]" />dry</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-amber" />processed</span>
        </span>
      </div>
      <div ref={wrap} className="w-full">
        <canvas ref={cv} style={{ width: '100%', height }} className="block rounded-md" />
      </div>
    </div>
  )
}

export function ImpulsePlot({ spec, active, height = 190 }: { spec: IrSpec; active: string | null; height?: number }) {
  const [wrap, w] = useWidth<HTMLDivElement>()
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const h = height
    const g = prep(cv.current, w, h)
    if (!g) return
    const dur = spec.data.length / spec.fs
    const tx = (t: number) => (t / dur) * (w - 30) + 30
    const range = 72
    const py = (d: number) => 6 + (Math.min(range, Math.max(0, -d)) / range) * (h - 22)
    // Regions
    for (const r of spec.regions) {
      const on = isActive(r.highlight, active)
      g.fillStyle = r.color + (on ? '33' : '12')
      g.fillRect(tx(r.t0), 0, Math.max(1, tx(r.t1) - tx(r.t0)), h - 16)
      g.fillStyle = on ? C.hl : C.text
      if (tx(r.t1) - tx(r.t0) > 30) g.fillText(r.label, tx(r.t0) + 3, h - 20)
    }
    // Grid
    g.strokeStyle = C.grid
    g.fillStyle = C.text
    for (let d = 0; d >= -range; d -= 12) {
      g.beginPath(); g.moveTo(30, py(d)); g.lineTo(w, py(d)); g.stroke()
      g.fillText(`${d}`, 2, py(d) + 3)
    }
    const tStep = dur > 3 ? 1 : dur > 1.2 ? 0.5 : 0.2
    for (let t = 0; t <= dur; t += tStep) g.fillText(`${t.toFixed(1)}s`, tx(t) - 8, h - 3)
    // Raw IR (faint, linear, centred)
    let m = 1e-9
    for (let i = 0; i < spec.data.length; i++) m = Math.max(m, Math.abs(spec.data[i]))
    const mid = (h - 16) / 2
    g.fillStyle = 'rgba(232,230,225,0.12)'
    const spp = spec.data.length / (w - 30)
    for (let x = 0; x < w - 30; x++) {
      let a = 0
      for (let i = Math.floor(x * spp); i < Math.floor((x + 1) * spp); i++) a = Math.max(a, Math.abs(spec.data[i]))
      const hh = (a / m) * mid
      g.fillRect(30 + x, mid - hh, 1, hh * 2)
    }
    for (const e of spec.envelopes) {
      const on = isActive(e.highlight, active)
      g.strokeStyle = e.color
      g.lineWidth = on ? 2.5 : 1.25
      g.beginPath()
      for (let b = 0; b < e.data.length; b++) {
        const x = tx(b * e.blockSec), y = py(e.data[b])
        b ? g.lineTo(x, y) : g.moveTo(x, y)
      }
      g.stroke()
    }
    g.lineWidth = 1
    for (const mk of spec.markers) {
      const on = isActive(mk.highlight, active)
      g.strokeStyle = on ? C.hl : 'rgba(232,230,225,0.5)'
      g.setLineDash([4, 3])
      g.beginPath(); g.moveTo(tx(mk.t), 0); g.lineTo(tx(mk.t), h - 16); g.stroke()
      g.setLineDash([])
      g.fillStyle = on ? C.hl : C.ink
      g.fillText(mk.label, Math.min(tx(mk.t) + 3, w - 34), 12)
      g.strokeStyle = on ? C.hl : 'rgba(232,230,225,0.3)'
      g.beginPath(); g.moveTo(30, py(-60)); g.lineTo(w, py(-60)); g.stroke()
    }
  }, [spec, active, w, height])
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-dim">
        <span>Impulse response: what one click turns into</span>
        <span className="flex gap-3 normal-case tracking-normal">
          {spec.envelopes.map((e) => (
            <span key={e.label} className="flex items-center gap-1"><span className="inline-block h-0.5 w-3" style={{ background: e.color }} />{e.label}</span>
          ))}
        </span>
      </div>
      <div ref={wrap} className="w-full">
        <canvas ref={cv} style={{ width: '100%', height }} className="block rounded-md" />
      </div>
    </div>
  )
}
