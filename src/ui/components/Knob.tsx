import { useRef } from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  defaultValue?: number
  log?: boolean
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  size?: number
  color?: string
}

/** Drag vertically (shift = fine), wheel to nudge, double-click to reset. */
export function Knob({ label, value, min, max, defaultValue, log, step, format, onChange, size = 40, color = 'var(--color-amber)' }: Props) {
  const toNorm = (v: number) =>
    log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min)
  const fromNorm = (n: number) => {
    n = Math.min(1, Math.max(0, n))
    let v = log ? min * Math.pow(max / min, n) : min + n * (max - min)
    if (step) v = Math.round(v / step) * step
    return v
  }
  const drag = useRef<{ y: number; n: number } | null>(null)
  const norm = toNorm(value)
  const angle = -135 + norm * 270
  const r = size / 2 - 4
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => {
      const rad = ((a - 90) * Math.PI) / 180
      return `${size / 2 + r * Math.cos(rad)} ${size / 2 + r * Math.sin(rad)}`
    }
    return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`
  }
  const bipolar = !log && min < 0 && max > 0
  const zeroA = bipolar ? -135 + toNorm(0) * 270 : -135

  return (
    <div className="flex select-none flex-col items-center gap-0.5" title={`${label} — drag, shift for fine, double-click to reset`}>
      <svg
        width={size}
        height={size}
        className="cursor-ns-resize touch-none"
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, n: norm }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const scale = e.shiftKey ? 600 : 150
          drag.current.n += (drag.current.y - e.clientY) / scale
          drag.current.y = e.clientY
          onChange(fromNorm(drag.current.n))
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onWheel={(e) => onChange(fromNorm(norm - Math.sign(e.deltaY) * 0.02))}
      >
        <path d={arc(-135, 135)} stroke="var(--color-panel-3)" strokeWidth={3} fill="none" strokeLinecap="round" />
        {Math.abs(angle - zeroA) > 0.5 && (
          <path d={arc(Math.min(zeroA, angle), Math.max(zeroA, angle))} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
        )}
        <circle cx={size / 2} cy={size / 2} r={r - 5} fill="var(--color-panel-2)" stroke="var(--color-line)" />
        <line
          x1={size / 2}
          y1={size / 2}
          x2={size / 2 + (r - 7) * Math.sin((angle * Math.PI) / 180)}
          y2={size / 2 - (r - 7) * Math.cos((angle * Math.PI) / 180)}
          stroke="var(--color-ink)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <div className="readout text-[11px] leading-none text-ink">{format ? format(value) : value.toFixed(1)}</div>
      <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
    </div>
  )
}
