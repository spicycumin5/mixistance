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
      <div className="readout relative w-5 text-[9px] text-dim" style={{ height }}>
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
        <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded bg-black/60" />
        <div
          className="absolute left-0 h-7 w-6 -translate-y-1/2 rounded-sm border border-line bg-gradient-to-b from-zinc-300 to-zinc-500 shadow-md"
          style={{ top: (1 - pos) * height }}
        >
          <div className="mt-[13px] h-px bg-black/70" />
        </div>
      </div>
    </div>
  )
}
