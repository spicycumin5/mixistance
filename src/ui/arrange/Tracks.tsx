// Tracks area: every channel laid out on a shared timeline, like a DAW's arrange window.
// Ruler: click to move the playhead, drag to set the cycle range (snapped to bars).

import { useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import type { ChannelState } from '../../state/types'
import { usePolled, useRaf } from '../hooks'

const HEADER_W = 168
const RULER_H = 24
const TRACK_H = 46

/** Min/max peaks per bucket, cached per buffer. */
const peakCache = new WeakMap<AudioBuffer, Float32Array>()
const BUCKETS = 4096
function peaksOf(buf: AudioBuffer): Float32Array {
  const hit = peakCache.get(buf)
  if (hit) return hit
  const out = new Float32Array(BUCKETS * 2)
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const n = buf.length
  for (let b = 0; b < BUCKETS; b++) {
    const a = Math.floor((b / BUCKETS) * n), e = Math.floor(((b + 1) / BUCKETS) * n)
    let lo = 0, hi = 0
    for (const d of chans) for (let i = a; i < e; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v }
    out[b * 2] = lo
    out[b * 2 + 1] = hi
  }
  peakCache.set(buf, out)
  return out
}

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
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  return g
}

function Region({ ch, width, duration, barSec }: { ch: ChannelState; width: number; duration: number; barSec: number }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const buf = engine.buffers.get(ch.id)
  const audible = !ch.mute
  useEffect(() => {
    const g = prep(cv.current, width, TRACK_H)
    if (!g || !duration) return
    // Bar grid
    g.fillStyle = '#242424'
    g.fillRect(0, 0, width, TRACK_H)
    g.strokeStyle = '#2e2e2e'
    for (let t = 0; t <= duration; t += barSec) {
      const x = Math.round((t / duration) * width) + 0.5
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TRACK_H); g.stroke()
    }
    if (!buf) return
    const x1 = Math.min(width, (buf.duration / duration) * width)
    const top = 2, h = TRACK_H - 4, labelH = 13
    const fill = audible ? ch.color : '#5b5b5b'
    // Region body and name bar
    g.save()
    g.beginPath()
    g.roundRect(1, top, x1 - 2, h, 3)
    g.clip()
    g.globalAlpha = 0.78
    g.fillStyle = fill
    g.fillRect(0, top, x1, h)
    g.globalAlpha = 1
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(0, top, x1, labelH)
    g.fillStyle = 'rgba(0,0,0,0.78)'
    g.font = '600 10px "IBM Plex Sans", sans-serif'
    g.fillText(ch.name, 6, top + 10)
    // Waveform (dark on the region colour)
    const peaks = peaksOf(buf)
    const mid = top + labelH + (h - labelH) / 2
    const amp = (h - labelH) / 2 - 1
    g.fillStyle = 'rgba(0,0,0,0.6)'
    for (let x = 0; x < x1; x++) {
      const b0 = Math.floor((x / x1) * BUCKETS), b1 = Math.max(b0 + 1, Math.floor(((x + 1) / x1) * BUCKETS))
      let lo = 0, hi = 0
      for (let b = b0; b < b1 && b < BUCKETS; b++) { lo = Math.min(lo, peaks[b * 2]); hi = Math.max(hi, peaks[b * 2 + 1]) }
      const y0 = mid - Math.min(1, hi) * amp, y1 = mid - Math.max(-1, lo) * amp
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
    }
    g.restore()
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.beginPath(); g.roundRect(1.5, top + 0.5, x1 - 3, h - 1, 3); g.stroke()
  }, [buf, width, duration, barSec, ch.color, ch.name, audible])
  return <canvas ref={cv} style={{ width, height: TRACK_H }} className="block" />
}

function Ruler({ width, duration, barSec }: { width: number; duration: number; barSec: number }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const loop = usePolled(() => engine.loop, 100)
  const drag = useRef<{ x0: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<{ a: number; b: number } | null>(null)
  const tOf = (x: number) => Math.max(0, Math.min(duration, (x / width) * duration))
  const snap = (t: number) => Math.round(t / barSec) * barSec

  useEffect(() => {
    const g = prep(cv.current, width, RULER_H)
    if (!g || !duration) return
    g.fillStyle = '#2a2a2a'
    g.fillRect(0, 0, width, RULER_H)
    const range = preview ? { start: Math.min(preview.a, preview.b), end: Math.max(preview.a, preview.b), enabled: true } : loop
    if (range.end > range.start) {
      g.fillStyle = range.enabled ? 'rgba(233,196,59,0.85)' : 'rgba(233,196,59,0.25)'
      g.fillRect((range.start / duration) * width, 2, ((range.end - range.start) / duration) * width, 9)
    }
    g.font = '10px "IBM Plex Mono", monospace'
    const bars = Math.ceil(duration / barSec)
    for (let i = 0; i <= bars; i++) {
      const x = Math.round((i * barSec / duration) * width) + 0.5
      g.strokeStyle = '#555'
      g.beginPath(); g.moveTo(x, 12); g.lineTo(x, RULER_H); g.stroke()
      for (let q = 1; q < 4; q++) {
        const xq = x + (q / 4) * (barSec / duration) * width
        g.strokeStyle = '#3c3c3c'
        g.beginPath(); g.moveTo(xq, 19); g.lineTo(xq, RULER_H); g.stroke()
      }
      if (i < bars) { g.fillStyle = '#a8a8a8'; g.fillText(String(i + 1), x + 3, 21) }
    }
    g.fillStyle = '#111'
    g.fillRect(0, RULER_H - 1, width, 1)
  }, [width, duration, barSec, loop, preview])

  return (
    <canvas
      ref={cv}
      style={{ width, height: RULER_H }}
      className="block cursor-pointer touch-none"
      title="Click to move the playhead. Drag to set the cycle range."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x0: e.nativeEvent.offsetX, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        if (Math.abs(e.nativeEvent.offsetX - d.x0) > 4) d.moved = true
        if (d.moved) setPreview({ a: snap(tOf(d.x0)), b: snap(tOf(e.nativeEvent.offsetX)) })
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        setPreview(null)
        if (!d) return
        if (!d.moved) { engine.seek(tOf(e.nativeEvent.offsetX)); return }
        const a = snap(tOf(d.x0)), b = snap(tOf(e.nativeEvent.offsetX))
        if (Math.abs(b - a) >= barSec) engine.setLoop({ enabled: true, start: Math.min(a, b), end: Math.max(a, b) })
      }}
    />
  )
}

function TrackHeader({ ch, index, selected }: { ch: ChannelState; index: number; selected: boolean }) {
  const { select, setChannel } = useStore.getState()
  return (
    <div
      onClick={() => select(ch.id)}
      className="flex cursor-pointer items-center gap-2 border-b border-line pr-2"
      style={{ height: TRACK_H, width: HEADER_W, background: selected ? '#3a3a3a' : 'var(--color-panel)' }}
    >
      <div className="h-full w-1 shrink-0" style={{ background: ch.color }} />
      <span className="readout w-4 text-right text-[10px] text-dim">{index + 1}</span>
      <span className={`min-w-0 flex-1 truncate text-[12px] ${selected ? 'text-white' : 'text-ink'}`}>{ch.name}</span>
      <div className="flex gap-[3px]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button" className="key w-[22px]" aria-pressed={ch.mute} title="Mute"
          style={ch.mute ? { background: 'var(--color-mute)', color: '#0b1f33', borderColor: 'var(--color-mute)' } : undefined}
          onClick={() => setChannel(ch.id, { mute: !ch.mute })}
        >M</button>
        <button
          type="button" className="key w-[22px]" aria-pressed={ch.solo} title="Solo"
          style={ch.solo ? { background: 'var(--color-solo)', color: '#2b2200', borderColor: 'var(--color-solo)' } : undefined}
          onClick={() => setChannel(ch.id, { solo: !ch.solo })}
        >S</button>
      </div>
    </div>
  )
}

export function Tracks() {
  const channels = useStore((s) => s.mix.channels)
  const selectedId = useStore((s) => s.selectedId)
  const bpm = useStore((s) => s.mix.bpm)
  const duration = usePolled(() => engine.duration, 500)
  const [lane, laneW] = useWidth<HTMLDivElement>()
  const head = useRef<HTMLDivElement>(null)
  const barSec = (60 / bpm) * 4

  useRaf(() => {
    if (!head.current || !duration) return
    head.current.style.transform = `translateX(${(engine.position / duration) * laneW}px)`
  })

  return (
    <div className="overflow-hidden rounded-[6px] border border-line bg-panel">
      <div className="flex">
        {/* Header column */}
        <div className="shrink-0 border-r border-line" style={{ width: HEADER_W }}>
          <div className="flex items-center border-b border-line px-2 text-[11px] text-dim" style={{ height: RULER_H }}>Tracks</div>
          {channels.map((c, i) => <TrackHeader key={c.id} ch={c} index={i} selected={c.id === selectedId} />)}
        </div>
        {/* Timeline */}
        <div ref={lane} className="relative min-w-0 flex-1">
          {laneW > 0 && (
            <>
              <Ruler width={laneW} duration={duration} barSec={barSec} />
              {channels.map((c) => (
                <div
                  key={c.id}
                  className="cursor-text border-b border-line"
                  title="Click to move the playhead"
                  onClick={(e) => {
                    useStore.getState().select(c.id)
                    const r = e.currentTarget.getBoundingClientRect()
                    engine.seek(((e.clientX - r.left) / r.width) * duration)
                  }}
                >
                  <Region ch={c} width={laneW} duration={duration} barSec={barSec} />
                </div>
              ))}
            </>
          )}
          <div ref={head} className="pointer-events-none absolute left-0 top-0 h-full w-px bg-white" />
        </div>
      </div>
    </div>
  )
}
