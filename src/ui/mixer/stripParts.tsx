// Small building blocks shared by channel, aux and master strips.

import { useMemo, useRef, type ReactNode } from 'react'
import { curveDb, logFreqs, type EqBand } from '../../dsp/biquad'
import { fmtDb } from '../format'
import { useRaf } from '../hooks'

const FREQS = logFreqs(48, 20, 20000)

/** Miniature EQ curve, like the EQ thumbnail at the top of a console strip. */
export function EqThumb({ bands, on, onClick }: { bands: EqBand[]; on: boolean; onClick?: () => void }) {
  const d = useMemo(() => {
    const w = 72, h = 26, range = 18
    return FREQS.map((f, i) => {
      const db = Math.max(-range, Math.min(range, curveDb(bands, f)))
      return `${i ? 'L' : 'M'}${((i / (FREQS.length - 1)) * w).toFixed(1)} ${(h / 2 - (db / range) * (h / 2 - 2)).toFixed(1)}`
    }).join(' ')
  }, [bands])
  return (
    <button type="button" onClick={onClick} className="well block w-full rounded-[3px]" title={on ? 'EQ (click to open)' : 'EQ bypassed (click to open)'}>
      <svg viewBox="0 0 72 26" className="block h-[26px] w-full">
        <line x1="0" y1="13" x2="72" y2="13" stroke="#2a2c31" strokeWidth="1" />
        <path d={d} fill="none" stroke={on ? '#7fb6ff' : '#4b4d55'} strokeWidth="1.3" />
      </svg>
    </button>
  )
}

/** Peak-hold readout. Click to reset. Turns red when it has gone over 0 dBFS. */
export function PeakReadout({ read }: { read: () => number }) {
  const el = useRef<HTMLButtonElement>(null)
  const hold = useRef(-Infinity)
  useRaf(() => {
    const p = read()
    if (p > hold.current) hold.current = p
    if (!el.current) return
    el.current.textContent = fmtDb(hold.current)
    el.current.style.color = hold.current > 0 ? '#ff6b6b' : 'var(--color-lcd)'
  })
  return (
    <button
      ref={el}
      type="button"
      title="Peak hold (click to reset)"
      onClick={(e) => { e.stopPropagation(); hold.current = -Infinity }}
      className="well readout h-[17px] flex-1 rounded-[3px] text-center text-[10px] leading-[15px]"
    />
  )
}

export function DbReadout({ db }: { db: number }) {
  return (
    <div className="well readout h-[17px] flex-1 rounded-[3px] text-center text-[10px] leading-[15px] text-lcd" title="Fader level (dB)">
      {fmtDb(db)}
    </div>
  )
}

/** Colour-coded name plate at the foot of a strip. */
export function NamePlate({ name, color, children }: { name: string; color?: string; children?: ReactNode }) {
  return (
    <div
      className="relative flex h-[22px] w-full items-center justify-center rounded-[3px] px-1 font-cond text-[11.5px] font-semibold"
      style={{
        background: color ? `linear-gradient(180deg, color-mix(in srgb, ${color} 100%, white 18%), ${color})` : 'linear-gradient(180deg, #5a5b62, #46474d)',
        color: color ? '#111' : 'var(--color-ink)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 1px rgba(0,0,0,0.5)',
        border: '1px solid rgba(0,0,0,0.55)',
      }}
      title={name}
    >
      <span className="truncate">{name}</span>
      {children}
    </div>
  )
}

/** Insert/send slot with an optional lit (active) state. */
export function Slot({ label, lit, title, onClick, right }: { label: string; lit?: boolean; title?: string; onClick?: () => void; right?: ReactNode }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      title={title}
      className={`slot ${onClick ? 'cursor-pointer' : ''}`}
      style={lit ? { background: 'linear-gradient(180deg, #4f86d6, #3a6cb8)', color: '#f2f6ff', borderColor: '#1c355c', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' } : undefined}
    >
      <span className="truncate">{label}</span>
      {right && <span className="ml-auto flex items-center">{right}</span>}
    </div>
  )
}

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="w-full px-0.5 font-cond text-[9.5px] leading-none text-dim/80">{children}</div>
)

export const SILENT = { peakDb: -120, rmsDb: -120 }
