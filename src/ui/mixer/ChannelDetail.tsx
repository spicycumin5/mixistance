import { useState } from 'react'
import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import { Knob } from '../components/Knob'
import { CompressorPanel } from '../plugins/CompressorPanel'
import { EQPanel } from '../plugins/EQPanel'
import { fmtDb } from '../format'

/** Level-match toggles live outside the store: they're a listening aid, not mix state. */
const levelMatched = new Set<string>()

export function ChannelDetail() {
  const ch = useStore((s) => s.mix.channels.find((c) => c.id === s.selectedId))
  const { setChannel, setEqBand, setComp } = useStore.getState()
  const [, force] = useState(0)
  if (!ch) return <div className="p-6 text-sm text-dim">Select a channel.</div>
  const strip = engine.strips.get(ch.id)
  const matched = levelMatched.has(ch.id)

  const toggleMatch = () => {
    matched ? levelMatched.delete(ch.id) : levelMatched.add(ch.id)
    strip?.eqSlot.setLevelMatch(!matched)
    strip?.compSlot.setLevelMatch(!matched)
    force((n) => n + 1)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: ch.color }} />
        <h2 className="text-base font-semibold">{ch.name}</h2>
        <Knob size={30} label="Trim" min={-24} max={24} defaultValue={0} value={ch.gainDb} step={0.5} format={(v) => fmtDb(v)} onChange={(v) => setChannel(ch.id, { gainDb: v })} />
        <label
          className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-dim"
          title="Loudness-match each processor's output to its input, so toggling EQ/CMP in and out compares tone and dynamics, not volume. Louder always sounds 'better', so this is how pros A/B."
        >
          <input type="checkbox" checked={matched} onChange={toggleMatch} className="accent-amber" />
          Level-matched A/B
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-lg border border-line bg-panel p-3">
          <header className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Parametric EQ</h3>
            <button
              className={`chip ml-auto ${ch.eqOn ? 'bg-sky-500 text-black' : 'bg-panel-3 text-dim'}`}
              onClick={() => setChannel(ch.id, { eqOn: !ch.eqOn })}
            >{ch.eqOn ? 'In' : 'Bypassed'}</button>
          </header>
          <EQPanel bands={ch.eq} onBand={(i, p) => setEqBand(ch.id, i, p)} pre={strip?.preProbe} post={strip?.compProbe} />
        </section>
        <section className="rounded-lg border border-line bg-panel p-3">
          <header className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Compressor</h3>
            <button
              className={`chip ml-auto ${ch.compOn ? 'bg-amber text-black' : 'bg-panel-3 text-dim'}`}
              onClick={() => setChannel(ch.id, { compOn: !ch.compOn })}
            >{ch.compOn ? 'In' : 'Bypassed'}</button>
          </header>
          <CompressorPanel
            params={ch.comp}
            onChange={(p) => setComp(ch.id, p)}
            readGr={() => (ch.compOn ? (engine.strips.get(ch.id)?.gr ?? 0) : 0)}
            readInput={() => engine.strips.get(ch.id)?.compProbe.levels().peakDb ?? -120}
          />
        </section>
      </div>
    </div>
  )
}
