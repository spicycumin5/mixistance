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
        <line x1="0" y1="13" x2="72" y2="13" stroke="#26272b" strokeWidth="1" />
        <path d={d} fill="none" stroke={on ? '#e6e6e8' : '#4b4d55'} strokeWidth="1.3" />
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
    el.current.style.color = hold.current > 0 ? 'var(--color-bad)' : 'var(--color-ink)'
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
    <div className="well readout h-[17px] flex-1 rounded-[3px] text-center text-[10px] leading-[15px] text-ink" title="Fader level (dB)">
      {fmtDb(db)}
    </div>
  )
}

/** Name plate at the foot of a strip; the track colour is a thin stripe on top. */
export function NamePlate({ name, color, children }: { name: string; color?: string; children?: ReactNode }) {
  return (
    <div className="relative w-full overflow-hidden rounded-[3px] bg-panel-3" title={name}>
      <div className="h-[3px]" style={{ background: color ?? 'var(--color-dim)' }} />
      <div className="flex h-[20px] items-center justify-center px-1 text-[11px] font-medium text-ink">
        <span className="truncate">{name}</span>
        {children}
      </div>
    </div>
  )
}

/** Insert/send slot. Lit slots get an amber dot and bright text. */
export function Slot({ label, lit, title, onClick, right }: { label: string; lit?: boolean; title?: string; onClick?: () => void; right?: ReactNode }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? !!lit : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      title={title}
      className={`slot ${onClick ? 'cursor-pointer hover:text-ink' : ''} ${lit ? '!bg-slot text-ink' : ''}`}
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
