import { useRef } from 'react'
import { fmtDb } from '../format'

// Console-style taper: more resolution near unity.
const MARKS = [6, 0, -6, -12, -24, -40, -60]
const toPos = (db: number) => {
  if (db <= -60) return 0
  if (db >= 0) return 0.75 + (db / 6) * 0.25
  if (db >= -12) return 0.45 + ((db + 12) / 12) * 0.3
  if (db >= -24) return 0.25 + ((db + 24) / 12) * 0.2
  return ((db + 60) / 36) * 0.25
}
const fromPos = (p: number) => {
  p = Math.min(1, Math.max(0, p))
  if (p >= 0.75) return ((p - 0.75) / 0.25) * 6
  if (p >= 0.45) return ((p - 0.45) / 0.3) * 12 - 12
  if (p >= 0.25) return ((p - 0.25) / 0.2) * 12 - 24
  return (p / 0.25) * 36 - 60
}

export function Fader({ value, onChange, height = 180 }: { value: number; onChange: (db: number) => void; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ y: number; p: number } | null>(null)
  const pos = toPos(value)

  return (
    <div className="flex items-stretch gap-1">
      <div className="readout relative w-5 text-[8.5px] text-dim/80" style={{ height }}>
        {MARKS.map((m) => (
          <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: (1 - toPos(m)) * height }}>
            {m > 0 ? `+${m}` : m}
          </span>
        ))}
      </div>
      <div
        ref={ref}
        className="relative w-6 cursor-ns-resize touch-none"
        style={{ height }}
        title={`${fmtDb(value)} dB — double-click for 0 dB`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = { y: e.clientY, p: pos }
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const scale = e.shiftKey ? 4 : 1
          dragging.current.p += (dragging.current.y - e.clientY) / height / scale
          dragging.current.y = e.clientY
          onChange(Math.round(fromPos(dragging.current.p) * 10) / 10)
        }}
        onPointerUp={() => (dragging.current = null)}
        onDoubleClick={() => onChange(0)}
        onWheel={(e) => onChange(Math.round(fromPos(pos - Math.sign(e.deltaY) * 0.01) * 10) / 10)}
      >
        {/* Groove */}
        <div
          className="absolute left-1/2 top-0 h-full w-[5px] -translate-x-1/2 rounded-full"
          style={{ background: '#0d0e10', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.06)' }}
        />
        {/* Unity mark */}
        <div className="absolute left-0 h-px w-full bg-white/15" style={{ top: (1 - toPos(0)) * height }} />
        {/* Cap: brushed metal, ribbed, with a centre line */}
        <div
          className="absolute left-0 h-8 w-6 -translate-y-1/2 rounded-[3px]"
          style={{
            top: (1 - pos) * height,
            background:
              'repeating-linear-gradient(180deg, rgba(0,0,0,0.0) 0 3px, rgba(0,0,0,0.18) 3px 4px), linear-gradient(180deg, #c9cad0, #8e9097 48%, #6b6d74 52%, #9fa1a8)',
            border: '1px solid #1a1b1e',
            boxShadow: '0 3px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.6)',
          }}
        >
          <div className="mt-[14px] h-[2px] bg-white/90 shadow-[0_1px_0_rgba(0,0,0,0.5)]" />
        </div>
      </div>
    </div>
  )
}
