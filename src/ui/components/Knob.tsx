import { useId, useRef } from 'react'

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
  /** Hide the value and label (compact strip knobs); both stay in the tooltip. */
  bare?: boolean
}

/** Drag vertically (shift = fine), wheel to nudge, double-click to reset. */
export function Knob({ label, value, min, max, defaultValue, log, step, format, onChange, size = 40, color = 'var(--color-amber)', bare }: Props) {
  const toNorm = (v: number) =>
    log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min)
  const fromNorm = (n: number) => {
    n = Math.min(1, Math.max(0, n))
    let v = log ? min * Math.pow(max / min, n) : min + n * (max - min)
    if (step) v = Math.round(v / step) * step
    return v
  }
  const drag = useRef<{ y: number; n: number } | null>(null)
  const gid = useId().replace(/:/g, '')
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
    <div className="flex select-none flex-col items-center gap-0.5" title={`${label}: ${format ? format(value) : value.toFixed(1)} (drag, shift for fine, double-click to reset)`}>
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
        <defs>
          <linearGradient id={`${gid}-cap`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6a6b72" />
            <stop offset="0.5" stopColor="#4a4b51" />
            <stop offset="1" stopColor="#323337" />
          </linearGradient>
          <linearGradient id={`${gid}-rim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.35)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.6)" />
          </linearGradient>
        </defs>
        {/* Recessed ring track, then the value arc */}
        <path d={arc(-135, 135)} stroke="#121315" strokeWidth={3.5} fill="none" strokeLinecap="round" />
        {Math.abs(angle - zeroA) > 0.5 && (
          <path d={arc(Math.min(zeroA, angle), Math.max(zeroA, angle))} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        )}
        {/* Raised plastic cap: drop shadow, gradient body, reflective rim */}
        <circle cx={size / 2} cy={size / 2 + 1} r={r - 4.5} fill="rgba(0,0,0,0.45)" />
        <circle cx={size / 2} cy={size / 2} r={r - 5} fill={`url(#${gid}-cap)`} stroke={`url(#${gid}-rim)`} strokeWidth={1} />
        <line
          x1={size / 2 + (r - 13) * Math.sin((angle * Math.PI) / 180) * 0.2}
          y1={size / 2 - (r - 13) * Math.cos((angle * Math.PI) / 180) * 0.2}
          x2={size / 2 + (r - 7) * Math.sin((angle * Math.PI) / 180)}
          y2={size / 2 - (r - 7) * Math.cos((angle * Math.PI) / 180)}
          stroke="#f2f2f4"
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </svg>
      {!bare && <div className="readout text-[10.5px] leading-none text-ink">{format ? format(value) : value.toFixed(1)}</div>}
      {!bare && <div className="font-cond text-[10.5px] leading-tight text-dim">{label}</div>}
    </div>
  )
}
