import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import { Fader } from '../components/Fader'
import { Knob } from '../components/Knob'
import { Meter } from '../components/Meter'
import { fmtDb } from '../format'
import { usePolled } from '../hooks'

const SILENT = { peakDb: -120, rmsDb: -120 }

function LufsRow({ label, value, target, hint }: { label: string; value: number; target?: [number, number]; hint: string }) {
  const ok = target && isFinite(value) ? value >= target[0] && value <= target[1] : undefined
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="text-[10px] uppercase tracking-wider text-dim">{label}</span>
      <span className={`readout text-sm ${ok === undefined ? 'text-ink' : ok ? 'text-good' : 'text-warn'}`}>
        {isFinite(value) ? value.toFixed(1) : '—'}
      </span>
    </div>
  )
}

export function MasterStrip() {
  const mix = useStore((s) => s.mix)
  const setMix = useStore((s) => s.setMix)
  const l = usePolled(() => engine.loudness, 100)

  return (
    <div className="flex shrink-0 gap-3 rounded-lg border border-line bg-panel p-2">
      <div className="flex w-[150px] flex-col gap-1.5">
        <div className="text-xs font-semibold">Master</div>
        <LufsRow label="Momentary" value={l.momentary} hint="400 ms window LUFS" />
        <LufsRow label="Short-term" value={l.shortTerm} hint="3 s window LUFS" />
        <LufsRow label="Integrated" value={l.integrated} target={[-23, -16]} hint="Gated loudness since play. Pre-master mix target: roughly -23 to -16 LUFS, leaving room for mastering." />
        <LufsRow label="True peak" value={l.truePeakDb} target={[-60, -3]} hint="Peak including inter-sample overs. Leave at least 3-6 dB headroom when sending to mastering." />
        <div className="mt-1 border-t border-line pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">FX returns</div>
          <div className="grid grid-cols-2 gap-y-2">
            <Knob size={30} label="Decay" min={0.3} max={5} defaultValue={1.8} value={mix.reverbDecay} step={0.1} format={(v) => `${v.toFixed(1)}s`} color="#a78bfa" onChange={(v) => setMix({ reverbDecay: v })} />
            <Knob size={30} label="Verb ret" min={-60} max={6} defaultValue={-6} value={mix.reverbReturnDb} format={(v) => fmtDb(v, 0)} color="#a78bfa" onChange={(v) => setMix({ reverbReturnDb: v })} />
            <Knob size={30} label="Time" min={0.25} max={2} step={0.25} defaultValue={0.75} value={mix.delayBeats} format={(v) => ({ 0.25: '1/16', 0.5: '1/8', 0.75: '1/8.', 1: '1/4', 1.5: '1/4.', 2: '1/2' } as Record<number, string>)[v] ?? `${v}b`} color="#22d3ee" onChange={(v) => setMix({ delayBeats: v })} />
            <Knob size={30} label="Feedback" min={0} max={0.85} defaultValue={0.3} value={mix.delayFeedback} format={(v) => `${Math.round(v * 100)}%`} color="#22d3ee" onChange={(v) => setMix({ delayFeedback: v })} />
            <Knob size={30} label="Dly ret" min={-60} max={6} defaultValue={-8} value={mix.delayReturnDb} format={(v) => fmtDb(v, 0)} color="#22d3ee" onChange={(v) => setMix({ delayReturnDb: v })} />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-end gap-2">
        <div className="flex items-end gap-1">
          <Fader value={mix.masterDb} onChange={(v) => setMix({ masterDb: v })} height={150} />
          <Meter width={12} height={150} read={() => engine.masterProbe?.levels() ?? SILENT} />
        </div>
        <div className="readout text-[11px]">{fmtDb(mix.masterDb)} dB</div>
      </div>
    </div>
  )
}
