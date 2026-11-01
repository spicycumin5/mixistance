import { useRef } from 'react'
import { useRaf } from '../hooks'

const FLOOR = -60
const pct = (db: number) => Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR))

/** Vertical peak/RMS meter with peak hold, driven by a level reader each frame. */
export function Meter({ read, height = 180, width = 8 }: { read: () => { peakDb: number; rmsDb: number }; height?: number; width?: number }) {
  const peakEl = useRef<HTMLDivElement>(null)
  const rmsEl = useRef<HTMLDivElement>(null)
  const holdEl = useRef<HTMLDivElement>(null)
  const state = useRef({ peak: FLOOR, hold: FLOOR, holdT: 0 })

  useRaf(() => {
    const { peakDb, rmsDb } = read()
    const s = state.current
    s.peak = Math.max(peakDb, s.peak - 1.2) // ballistic fall
    const now = performance.now()
    if (peakDb > s.hold || now - s.holdT > 1500) {
      s.hold = peakDb
      s.holdT = now
    }
    if (peakEl.current) peakEl.current.style.height = `${pct(s.peak) * 100}%`
    if (rmsEl.current) rmsEl.current.style.height = `${pct(rmsDb) * 100}%`
    if (holdEl.current) {
      holdEl.current.style.bottom = `${pct(s.hold) * 100}%`
      holdEl.current.style.background = s.hold > -0.1 ? 'var(--color-bad)' : 'var(--color-ink)'
    }
  })

  return (
    <div className="relative overflow-hidden rounded-sm bg-black/70" style={{ height, width }}>
      <div
        ref={peakEl}
        className="absolute bottom-0 w-full opacity-50"
        style={{ background: 'linear-gradient(to top, #22c55e 0%, #22c55e 70%, #facc15 85%, #ef4444 100%)', backgroundSize: `100% ${height}px`, backgroundPosition: 'bottom' }}
      />
      <div
        ref={rmsEl}
        className="absolute bottom-0 w-full"
        style={{ background: 'linear-gradient(to top, #22c55e 0%, #22c55e 70%, #facc15 85%, #ef4444 100%)', backgroundSize: `100% ${height}px`, backgroundPosition: 'bottom' }}
      />
      <div ref={holdEl} className="absolute h-px w-full" />
    </div>
  )
}
