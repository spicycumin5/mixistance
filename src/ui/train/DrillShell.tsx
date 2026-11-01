import { useEffect, useState, type ReactNode } from 'react'
import { drillPlayer, SOURCE_LABELS, type DrillSource } from '../../audio/drillPlayer'
import { drillStats, type DrillStats } from '../../training/progress'
import { usePolled } from '../hooks'

export function useDrillStats(id: string) {
  const [stats, setStats] = useState<DrillStats>(() => drillStats(id))
  return [stats, setStats] as const
}

export function StatsBar({ stats }: { stats: DrillStats }) {
  const recent = stats.recent.length ? stats.recent.reduce((a, b) => a + b, 0) / stats.recent.length : 0
  return (
    <div className="flex items-center gap-4 text-xs text-dim">
      <span>Attempts <b className="readout text-ink">{stats.attempts}</b></span>
      <span>Recent avg <b className="readout text-ink">{Math.round(recent * 100)}%</b></span>
      <span>Streak <b className="readout text-amber">{stats.streak}</b></span>
      <span>Best <b className="readout text-ink">{stats.best}</b></span>
      <div className="flex h-4 items-end gap-px">
        {stats.recent.map((s, i) => (
          <div key={i} className="w-1.5 rounded-sm" style={{ height: `${20 + s * 80}%`, background: s >= 0.999 ? 'var(--color-good)' : s > 0 ? 'var(--color-warn)' : 'var(--color-bad)' }} />
        ))}
      </div>
    </div>
  )
}

/** Source picker + transport + A/B switch shared by all drills. */
export function DrillTransport({
  sources, source, onSource, labels = ['A', 'B'], extra,
}: {
  sources: DrillSource[]
  source: DrillSource
  onSource: (s: DrillSource) => void
  labels?: string[]
  extra?: ReactNode
}) {
  const playing = usePolled(() => drillPlayer.playing, 100)
  const sel = usePolled(() => drillPlayer.selected, 50)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i >= 0 && i < labels.length) drillPlayer.select(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [labels.length])

  useEffect(() => () => drillPlayer.stop(), [])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-primary w-20" onClick={() => (playing ? drillPlayer.stop() : drillPlayer.play())}>
        {playing ? '■ Stop' : '▶ Play'}
      </button>
      <div className="flex overflow-hidden rounded-md border border-line">
        {labels.map((l, i) => (
          <button
            key={l}
            className={`px-4 py-1.5 text-sm font-semibold transition ${sel === i ? 'bg-amber text-black' : 'bg-panel-2 text-dim hover:text-ink'}`}
            onClick={() => drillPlayer.select(i)}
            title={`Key ${i + 1}`}
          >{l}</button>
        ))}
      </div>
      <span className="text-[11px] text-dim">keys 1/2 to switch, so you can flip back and forth fast</span>
      <select
        className="ml-auto rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
        value={source}
        onChange={(e) => onSource(e.target.value as DrillSource)}
      >
        {sources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
      </select>
      {extra}
    </div>
  )
}

export function Verdict({ score, children }: { score: number; children: ReactNode }) {
  const tone = score >= 0.999 ? 'border-good/40 bg-good/10' : score > 0 ? 'border-warn/40 bg-warn/10' : 'border-bad/40 bg-bad/10'
  const head = score >= 0.999 ? 'Correct' : score > 0 ? 'Close' : 'Not quite'
  return (
    <div className={`rounded-md border p-3 text-sm ${tone}`}>
      <div className="mb-1 font-semibold">{head} <span className="readout text-xs text-dim">({Math.round(score * 100)}%)</span></div>
      {children}
    </div>
  )
}
