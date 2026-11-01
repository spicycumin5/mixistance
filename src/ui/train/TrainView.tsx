import { useState } from 'react'
import { CompDrill } from './CompDrill'
import { EqMatchDrill } from './EqMatchDrill'
import { FreqIdDrill } from './FreqIdDrill'
import { LevelDrill } from './LevelDrill'

const DRILLS = [
  { id: 'freq', title: 'Frequency ID', tag: 'EQ', blurb: 'Name the boosted or cut band. The foundation of fast, confident EQ.', C: FreqIdDrill },
  { id: 'eqmatch', title: 'EQ Match', tag: 'EQ', blurb: 'Recreate a hidden EQ curve by ear, then see how close you got.', C: EqMatchDrill },
  { id: 'comp', title: 'Hear the Compression', tag: 'Dynamics', blurb: 'Spot compression, attack speed and ratio at matched loudness.', C: CompDrill },
  { id: 'level', title: 'Level Discrimination', tag: 'Listening', blurb: 'Detect 0.5-3 dB changes, so loudness stops fooling you.', C: LevelDrill },
]

export function TrainView() {
  const [active, setActive] = useState(DRILLS[0].id)
  const drill = DRILLS.find((d) => d.id === active)!
  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[260px_1fr]">
      <nav className="flex flex-col gap-2">
        {DRILLS.map((d) => (
          <button
            key={d.id}
            onClick={() => setActive(d.id)}
            className={`rounded-lg border p-3 text-left transition ${d.id === active ? 'border-amber/70 bg-panel-2' : 'border-line bg-panel hover:border-zinc-600'}`}
          >
            <div className="text-[10px] uppercase tracking-wider text-dim">{d.tag}</div>
            <div className="text-sm font-semibold">{d.title}</div>
            <div className="mt-0.5 text-xs text-dim">{d.blurb}</div>
          </button>
        ))}
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-dim">
          Short daily sessions (10 min) beat occasional long ones. Use headphones or monitors at a moderate, consistent volume.
        </p>
      </nav>
      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">{drill.title}</h2>
        <drill.C key={drill.id} />
      </section>
    </div>
  )
}
