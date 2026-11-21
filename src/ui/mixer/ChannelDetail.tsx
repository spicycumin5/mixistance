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
        <span className="h-3 w-3 rounded-[2px]" style={{ background: ch.color }} />
        <h2 className="text-[15px] font-semibold">{ch.name}</h2>
        <Knob size={30} label="Trim" min={-24} max={24} defaultValue={0} value={ch.gainDb} step={0.5} format={(v) => fmtDb(v)} onChange={(v) => setChannel(ch.id, { gainDb: v })} />
        <label
          className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-dim"
          title="Loudness-match each processor's output to its input, so toggling EQ/CMP in and out compares tone and dynamics, not volume. Louder always sounds 'better', so this is how pros A/B."
        >
          <input type="checkbox" checked={matched} onChange={toggleMatch} className="accent-[#f0a43a]" />
          Level-matched A/B
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <section className="surface overflow-hidden rounded-[6px]">
          <PluginBar title="Parametric EQ" channel={ch.name} color={ch.color} on={ch.eqOn} onToggle={() => setChannel(ch.id, { eqOn: !ch.eqOn })} />
          <div className="p-3"><EQPanel bands={ch.eq} onBand={(i, p) => setEqBand(ch.id, i, p)} pre={strip?.preProbe} post={strip?.compProbe} /></div>
        </section>
        <section className="surface overflow-hidden rounded-[6px]">
          <PluginBar title="Compressor" channel={ch.name} color={ch.color} on={ch.compOn} onToggle={() => setChannel(ch.id, { compOn: !ch.compOn })} />
          <div className="p-3"><CompressorPanel
            params={ch.comp}
            onChange={(p) => setComp(ch.id, p)}
            readGr={() => (ch.compOn ? (engine.strips.get(ch.id)?.gr ?? 0) : 0)}
            readInput={() => engine.strips.get(ch.id)?.compProbe.levels().peakDb ?? -120}
          /></div>
        </section>
      </div>
    </div>
  )
}

/** Plug-in window title bar: power button, plug-in name, channel it sits on. */
function PluginBar({ title, channel, color, on, onToggle }: { title: string; channel: string; color: string; on: boolean; onToggle: () => void }) {
  return (
    <header className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        title={on ? 'On (click to bypass)' : 'Bypassed (click to switch on)'}
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors ${on ? 'border-amber bg-amber' : 'border-line bg-panel-3'}`}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke={on ? '#1c1d20' : '#8d8f96'} strokeWidth="1.6" strokeLinecap="round"><path d="M5 1v4" /><path d="M2.6 2.8a3.4 3.4 0 104.8 0" /></svg>
      </button>
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {!on && <span className="text-[12px] text-dim">Bypassed</span>}
      <span className="ml-auto flex items-center gap-1.5 text-[12px] text-dim">
        <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />{channel}
      </span>
    </header>
  )
}
