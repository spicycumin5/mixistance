// Tracks area: every channel on a shared, zoomable timeline, like a DAW's arrange window.
//   Ruler: click to move the playhead, drag to set the cycle range (snapped to bars).
//   Regions: drag to move (snaps to beats; hold Alt for free movement).
//   Zoom: Ctrl/⌘ + scroll, or the −/+/Fit buttons. Pan: Shift + scroll, trackpad swipe, or the overview bar.

import { useCallback, useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import type { ChannelState } from '../../state/types'
import { usePolled, useRaf } from '../hooks'

const HEADER_W = 168
const RULER_H = 24
const TRACK_H = 46
const OVERVIEW_H = 10

export interface View { t0: number; span: number }

/** Min/max peaks per bucket, cached per buffer (used when zoomed out). */
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

/** Min/max of a buffer between two times (seconds into the buffer). Uses raw samples when zoomed in. */
function rangePeak(buf: AudioBuffer, a: number, b: number): [number, number] {
  const sa = Math.max(0, Math.floor(a * buf.sampleRate)), sb = Math.min(buf.length, Math.ceil(b * buf.sampleRate))
  if (sb <= sa) return [0, 0]
  let lo = 0, hi = 0
  if (sb - sa < buf.length / BUCKETS) {
    const d = buf.getChannelData(0)
    for (let i = sa; i < sb; i++) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v }
  } else {
    const p = peaksOf(buf)
    const b0 = Math.floor((sa / buf.length) * BUCKETS), b1 = Math.max(b0 + 1, Math.ceil((sb / buf.length) * BUCKETS))
    for (let k = b0; k < b1 && k < BUCKETS; k++) { lo = Math.min(lo, p[k * 2]); hi = Math.max(hi, p[k * 2 + 1]) }
  }
  return [lo, hi]
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
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  return g
}

/** Grid density for the current zoom: bars, beats, or 16ths. */
function gridStep(span: number, width: number, barSec: number) {
  const pxPerBeat = (width / span) * (barSec / 4)
  if (pxPerBeat > 90) return barSec / 16
  if (pxPerBeat > 14) return barSec / 4
  return barSec
}

function Lane({ ch, width, view, barSec, offset, dragging }: {
  ch: ChannelState; width: number; view: View; barSec: number; offset: number; dragging: boolean
}) {
  const cv = useRef<HTMLCanvasElement>(null)
  const buf = engine.rawBuffers.get(ch.id)
  const audible = !ch.mute
  useEffect(() => {
    const g = prep(cv.current, width, TRACK_H)
    if (!g) return
    const x = (t: number) => ((t - view.t0) / view.span) * width
    g.fillStyle = '#242424'
    g.fillRect(0, 0, width, TRACK_H)
    // Grid
    const step = gridStep(view.span, width, barSec)
    for (let t = Math.floor(view.t0 / step) * step; t <= view.t0 + view.span; t += step) {
      const isBar = Math.abs(t / barSec - Math.round(t / barSec)) < 1e-6
      g.strokeStyle = isBar ? '#323232' : '#2a2a2a'
      const xx = Math.round(x(t)) + 0.5
      g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, TRACK_H); g.stroke()
    }
    if (!buf) return
    const r0 = x(offset), r1 = x(offset + buf.duration)
    if (r1 < 0 || r0 > width) return
    const top = 2, h = TRACK_H - 4, labelH = 13
    const left = Math.max(-4, r0), right = Math.min(width + 4, r1)
    g.save()
    g.beginPath()
    g.roundRect(r0 + 1, top, r1 - r0 - 2, h, 3)
    g.clip()
    g.globalAlpha = dragging ? 0.95 : 0.78
    g.fillStyle = audible ? ch.color : '#5b5b5b'
    g.fillRect(left, top, right - left, h)
    g.globalAlpha = 1
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(left, top, right - left, labelH)
    g.fillStyle = 'rgba(0,0,0,0.78)'
    g.font = '600 10px "IBM Plex Sans", sans-serif'
    g.fillText(ch.name, Math.max(r0, 0) + 6, top + 10)
    // Waveform for the visible part only
    const mid = top + labelH + (h - labelH) / 2
    const amp = (h - labelH) / 2 - 1
    g.fillStyle = 'rgba(0,0,0,0.6)'
    const secPerPx = view.span / width
    for (let px = Math.max(0, Math.floor(r0)); px < Math.min(width, Math.ceil(r1)); px++) {
      const ta = view.t0 + px * secPerPx - offset
      const [lo, hi] = rangePeak(buf, ta, ta + secPerPx)
      const y0 = mid - Math.min(1, hi) * amp, y1 = mid - Math.max(-1, lo) * amp
      g.fillRect(px, y0, 1, Math.max(1, y1 - y0))
    }
    g.restore()
    g.strokeStyle = dragging ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)'
    g.beginPath(); g.roundRect(r0 + 1.5, top + 0.5, r1 - r0 - 3, h - 1, 3); g.stroke()
  }, [buf, width, view, barSec, ch.color, ch.name, audible, offset, dragging])
  return <canvas ref={cv} style={{ width, height: TRACK_H }} className="block" />
}

function Ruler({ width, view, barSec, total }: { width: number; view: View; barSec: number; total: number }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const loop = usePolled(() => engine.loop, 100)
  const drag = useRef<{ x0: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<{ a: number; b: number } | null>(null)
  const tOf = (px: number) => Math.max(0, Math.min(total, view.t0 + (px / width) * view.span))
  const snap = (t: number) => Math.round(t / barSec) * barSec

  useEffect(() => {
    const g = prep(cv.current, width, RULER_H)
    if (!g) return
    const x = (t: number) => ((t - view.t0) / view.span) * width
    g.fillStyle = '#2a2a2a'
    g.fillRect(0, 0, width, RULER_H)
    const range = preview ? { start: Math.min(preview.a, preview.b), end: Math.max(preview.a, preview.b), enabled: true } : loop
    if (range.end > range.start) {
      g.fillStyle = range.enabled ? 'rgba(233,196,59,0.85)' : 'rgba(233,196,59,0.25)'
      g.fillRect(x(range.start), 2, x(range.end) - x(range.start), 9)
    }
    g.font = '10px "IBM Plex Mono", monospace'
    const step = gridStep(view.span, width, barSec)
    const beat = barSec / 4
    const pxPerBeat = (width / view.span) * beat
    for (let t = Math.floor(view.t0 / step) * step; t <= view.t0 + view.span; t += step) {
      const bar = Math.round(t / barSec * 1e6) / 1e6
      const isBar = Math.abs(bar - Math.round(bar)) < 1e-6
      const isBeat = Math.abs(t / beat - Math.round(t / beat)) < 1e-6
      const xx = Math.round(x(t)) + 0.5
      g.strokeStyle = isBar ? '#5a5a5a' : isBeat ? '#444' : '#383838'
      g.beginPath(); g.moveTo(xx, isBar ? 12 : isBeat ? 17 : 20); g.lineTo(xx, RULER_H); g.stroke()
      if (isBar) { g.fillStyle = '#a8a8a8'; g.fillText(String(Math.round(bar) + 1), xx + 3, 21) }
      else if (isBeat && pxPerBeat > 48) {
        g.fillStyle = '#6e6e6e'
        g.fillText(`${Math.floor(bar) + 1}.${Math.round((t % barSec) / beat) + 1}`, xx + 3, 21)
      }
    }
    g.fillStyle = '#111'
    g.fillRect(0, RULER_H - 1, width, 1)
  }, [width, view, barSec, loop, preview])

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

/** Overview strip: the whole song with a draggable window for the visible range. */
function Overview({ width, view, total, onPan }: { width: number; view: View; total: number; onPan: (t0: number) => void }) {
  const drag = useRef<{ x: number; t0: number } | null>(null)
  if (view.span >= total - 1e-6) return <div style={{ height: OVERVIEW_H }} className="bg-panel" />
  const left = (view.t0 / total) * width
  const w = Math.max(16, (view.span / total) * width)
  return (
    <div
      className="relative cursor-pointer bg-well"
      style={{ height: OVERVIEW_H }}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const t = ((e.clientX - r.left) / width) * total
        if (t < view.t0 || t > view.t0 + view.span) onPan(t - view.span / 2)
      }}
    >
      <div
        className="absolute top-[2px] h-[6px] cursor-grab touch-none rounded-full bg-[#6a6a6a] hover:bg-[#808080]"
        style={{ left, width: w }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, t0: view.t0 }
        }}
        onPointerMove={(e) => { if (drag.current) onPan(drag.current.t0 + ((e.clientX - drag.current.x) / width) * total) }}
        onPointerUp={() => (drag.current = null)}
      />
    </div>
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
  const songLen = usePolled(() => engine.duration, 300)
  const [lane, laneW] = useWidth<HTMLDivElement>()
  const head = useRef<HTMLDivElement>(null)
  const barSec = (60 / bpm) * 4
  // Room after the song so regions can be dragged later.
  const total = Math.max(barSec, Math.ceil(songLen / barSec) * barSec + barSec * 2)
  const [view, setView] = useState<View>({ t0: 0, span: 0 })
  const v: View = view.span > 0 ? view : { t0: 0, span: total }
  const [drag, setDrag] = useState<{ id: string; x0: number; orig: number; offset: number; moved: boolean } | null>(null)

  const clamp = useCallback((nv: View): View => {
    const span = Math.min(total, Math.max(barSec / 8, nv.span))
    return { span, t0: Math.min(Math.max(0, nv.t0), total - span) }
  }, [total, barSec])

  // Fit when the song length first becomes known (or the session changes).
  useEffect(() => { setView((cur) => (cur.span === 0 || cur.span > total ? { t0: 0, span: total } : clamp(cur))) }, [total, clamp])

  const zoomAt = useCallback((factor: number, atPx?: number) => {
    setView((cur) => {
      const c = cur.span > 0 ? cur : { t0: 0, span: total }
      const anchor = c.t0 + ((atPx ?? laneW / 2) / Math.max(1, laneW)) * c.span
      const span = c.span * factor
      return clamp({ span, t0: anchor - ((atPx ?? laneW / 2) / Math.max(1, laneW)) * span })
    })
  }, [clamp, laneW, total])

  // Wheel: Ctrl/⌘ zooms at the cursor; Shift or horizontal swipe pans. Plain scroll still scrolls the page.
  useEffect(() => {
    const el = lane.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const px = e.clientX - el.getBoundingClientRect().left
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoomAt(Math.pow(1.0018, e.deltaY), px)
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        const d = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX
        setView((cur) => { const c = cur.span > 0 ? cur : { t0: 0, span: total }; return clamp({ ...c, t0: c.t0 + (d / laneW) * c.span }) })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [lane, zoomAt, clamp, laneW, total])

  useRaf(() => {
    const el = head.current
    if (!el || !laneW) return
    const p = engine.position
    const x = ((p - v.t0) / v.span) * laneW
    el.style.display = x < 0 || x > laneW ? 'none' : 'block'
    el.style.transform = `translateX(${x}px)`
  })

  const beat = barSec / 4
  const offsetFor = (c: ChannelState) => (drag?.id === c.id ? drag.offset : Math.max(0, c.offset ?? 0))

  const regionAt = (c: ChannelState, px: number) => {
    const raw = engine.rawBuffers.get(c.id)
    if (!raw) return false
    const t = v.t0 + (px / laneW) * v.span
    const off = offsetFor(c)
    return t >= off && t <= off + raw.duration
  }

  return (
    <div className="overflow-hidden rounded-[6px] border border-line bg-panel">
      <div className="flex">
        {/* Header column */}
        <div className="shrink-0 border-r border-line" style={{ width: HEADER_W }}>
          <div className="flex items-center gap-1 border-b border-line px-2" style={{ height: RULER_H }}>
            <span className="text-[11px] text-dim">Tracks</span>
            <div className="ml-auto flex gap-[3px]">
              <button type="button" className="key w-[20px]" title="Zoom out (Ctrl/⌘ + scroll)" aria-label="Zoom out" onClick={() => zoomAt(1.6)}>−</button>
              <button type="button" className="key w-[20px]" title="Zoom in (Ctrl/⌘ + scroll)" aria-label="Zoom in" onClick={() => zoomAt(1 / 1.6)}>+</button>
              <button type="button" className="key px-1.5" title="Show the whole song" onClick={() => setView({ t0: 0, span: total })}>Fit</button>
            </div>
          </div>
          {channels.map((c, i) => <TrackHeader key={c.id} ch={c} index={i} selected={c.id === selectedId} />)}
          <div className="border-t border-line bg-panel" style={{ height: OVERVIEW_H }} />
        </div>
        {/* Timeline */}
        <div ref={lane} className="relative min-w-0 flex-1 select-none">
          {laneW > 0 && (
            <>
              <Ruler width={laneW} view={v} barSec={barSec} total={total} />
              {channels.map((c) => (
                <div
                  key={c.id}
                  className="touch-none border-b border-line"
                  style={{ cursor: drag?.id === c.id ? 'grabbing' : undefined }}
                  onPointerMove={(e) => {
                    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
                    if (!drag) { e.currentTarget.style.cursor = regionAt(c, px) ? 'grab' : 'text'; return }
                    if (drag.id !== c.id) return
                    const dx = e.clientX - drag.x0
                    if (!drag.moved && Math.abs(dx) < 3) return
                    let off = drag.orig + (dx / laneW) * v.span
                    if (!e.altKey) off = Math.round(off / beat) * beat
                    setDrag({ ...drag, offset: Math.max(0, off), moved: true })
                  }}
                  onPointerDown={(e) => {
                    useStore.getState().select(c.id)
                    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
                    if (regionAt(c, px)) {
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setDrag({ id: c.id, x0: e.clientX, orig: offsetFor(c), offset: offsetFor(c), moved: false })
                    } else {
                      engine.seek(Math.min(total, v.t0 + (px / laneW) * v.span))
                    }
                  }}
                  onPointerUp={(e) => {
                    if (!drag || drag.id !== c.id) return
                    if (drag.moved) useStore.getState().setChannel(c.id, { offset: drag.offset })
                    else engine.seek(v.t0 + ((e.clientX - e.currentTarget.getBoundingClientRect().left) / laneW) * v.span)
                    setDrag(null)
                  }}
                >
                  <Lane ch={c} width={laneW} view={v} barSec={barSec} offset={offsetFor(c)} dragging={drag?.id === c.id && drag.moved} />
                </div>
              ))}
              <div className="border-t border-line">
                <Overview width={laneW} view={v} total={total} onPan={(t0) => setView(clamp({ ...v, t0 }))} />
              </div>
            </>
          )}
          <div ref={head} className="pointer-events-none absolute left-0 top-0 w-px bg-white" style={{ height: RULER_H + channels.length * (TRACK_H + 1) }} />
        </div>
      </div>
      {drag?.moved && (
        <div className="border-t border-line px-3 py-1 text-[11px] text-dim">
          Moving {channels.find((c) => c.id === drag.id)?.name} to bar {Math.floor(drag.offset / barSec) + 1}, beat {Math.round((drag.offset % barSec) / beat) + 1}. Hold Alt to move off the grid.
        </div>
      )}
    </div>
  )
}
