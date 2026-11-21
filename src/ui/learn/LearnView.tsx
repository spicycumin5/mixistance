import { useState } from 'react'
import { LABS } from '../../lab'
import { useLabNav } from '../../lab/nav'
import type { Params } from '../../lab/types'
import { LabShell } from './LabShell'

const GROUPS = ['Dynamics', 'Tone', 'Space', 'Technique'] as const

export function LearnView() {
  // Pick up a request from elsewhere in the app (e.g. "How does this work?" on a channel compressor).
  const [initial] = useState(() => useLabNav.getState().consume())
  const [active, setActive] = useState(initial?.lab ?? LABS[0].id)
  const [initialParams, setInitialParams] = useState<Params | undefined>(initial?.params)
  const lab = LABS.find((l) => l.id === active) ?? LABS[0]

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[230px_1fr]">
      <nav className="flex flex-col gap-3">
        {GROUPS.map((g) => {
          const labs = LABS.filter((l) => l.tag === g)
          if (!labs.length) return null
          return (
            <div key={g} className="flex flex-col gap-1.5">
              <div className="px-1 text-[10px] font-semibold text-dim">{g}</div>
              {labs.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setActive(l.id); setInitialParams(undefined) }}
                  className={`rounded-lg border p-2.5 text-left transition ${l.id === active ? 'border-amber/70 bg-panel-2' : 'border-line bg-panel hover:border-zinc-600'}`}
                >
                  <div className="text-sm font-semibold">{l.title}</div>
                  <div className="mt-0.5 text-xs text-dim">{l.blurb}</div>
                </button>
              ))}
            </div>
          )
        })}
        <p className="px-1 text-[11px] leading-relaxed text-dim">
          Each lab runs the processor on a short loop and draws exactly what you hear. Use headphones or monitors at a moderate volume.
        </p>
      </nav>
      <section className="min-w-0 rounded-lg border border-line bg-panel p-4">
        <h2 className="mb-3 text-lg font-semibold">{lab.title}</h2>
        <LabShell key={lab.id + (initialParams ? ':init' : '')} lab={lab} initialParams={initialParams} />
      </section>
    </div>
  )
}
