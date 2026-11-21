import type { ReactNode } from 'react'
import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import { Fader } from '../components/Fader'
import { Knob } from '../components/Knob'
import { Meter } from '../components/Meter'
import { fmtDb } from '../format'
import { usePolled } from '../hooks'
import { STRIP_FADER_H } from './ChannelStripView'
import { DbReadout, NamePlate, PeakReadout, SectionLabel, SILENT, Slot } from './stripParts'

const DELAY_LABELS: Record<number, string> = { 0.25: '1/16', 0.5: '1/8', 0.75: '1/8.', 1: '1/4', 1.5: '1/4.', 2: '1/2' }

function LufsRow({ label, value, target, hint }: { label: string; value: number; target?: [number, number]; hint: string }) {
  const ok = target && isFinite(value) ? value >= target[0] && value <= target[1] : undefined
  return (
    <div className="flex items-baseline justify-between gap-2" title={hint}>
      <span className="font-cond text-[11px] text-dim">{label}</span>
      <span className={`readout text-[13px] ${ok === undefined ? 'text-lcd' : ok ? 'text-good' : 'text-warn'}`}>
        {isFinite(value) ? value.toFixed(1) : '—'}
      </span>
    </div>
  )
}

/** Effect return strip: the bus effect's settings at the top, its return level on the fader. */
function AuxStrip({ name, color, knobs, returnDb, onReturn }: {
  name: string; color: string; knobs: ReactNode; returnDb: number; onReturn: (db: number) => void
}) {
  return (
    <div className="surface flex w-[86px] shrink-0 flex-col items-center gap-1.5 rounded-[4px] px-1.5 pb-1.5 pt-2">
      <SectionLabel>Effect</SectionLabel>
      <Slot label={name} lit title={`${name} on the bus`} />
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 py-1">{knobs}</div>
      <Slot label="Stereo Out" title="Output" />
      <div className="flex w-full gap-[3px]"><DbReadout db={returnDb} /></div>
      <Fader value={returnDb} onChange={onReturn} height={STRIP_FADER_H} />
      <div className="h-[18px]" />
      <NamePlate name={`${name} bus`} color={color} />
    </div>
  )
}

export function MasterStrip() {
  const mix = useStore((s) => s.mix)
  const setMix = useStore((s) => s.setMix)
  const l = usePolled(() => engine.loudness, 100)

  return (
    <div className="flex shrink-0 gap-1.5">
      <AuxStrip
        name="Reverb" color="#a78bfa" returnDb={mix.reverbReturnDb} onReturn={(v) => setMix({ reverbReturnDb: v })}
        knobs={<Knob size={34} label="Decay" min={0.3} max={5} defaultValue={1.8} value={mix.reverbDecay} step={0.1} format={(v) => `${v.toFixed(1)}s`} color="#a78bfa" onChange={(v) => setMix({ reverbDecay: v })} />}
      />
      <AuxStrip
        name="Delay" color="#22d3ee" returnDb={mix.delayReturnDb} onReturn={(v) => setMix({ delayReturnDb: v })}
        knobs={
          <>
            <Knob size={30} label="Time" min={0.25} max={2} step={0.25} defaultValue={0.75} value={mix.delayBeats} format={(v) => DELAY_LABELS[v] ?? `${v}b`} color="#22d3ee" onChange={(v) => setMix({ delayBeats: v })} />
            <Knob size={30} label="Feedback" min={0} max={0.85} defaultValue={0.3} value={mix.delayFeedback} format={(v) => `${Math.round(v * 100)}%`} color="#22d3ee" onChange={(v) => setMix({ delayFeedback: v })} />
          </>
        }
      />

      <div className="surface flex shrink-0 gap-2 rounded-[4px] px-2 pb-1.5 pt-2">
        <div className="flex w-[132px] flex-col gap-1.5">
          <SectionLabel>Loudness (LUFS)</SectionLabel>
          <div className="well flex flex-col gap-1 rounded-[4px] px-2 py-1.5">
            <LufsRow label="Momentary" value={l.momentary} hint="400 ms window LUFS" />
            <LufsRow label="Short-term" value={l.shortTerm} hint="3 s window LUFS" />
            <LufsRow label="Integrated" value={l.integrated} target={[-23, -16]} hint="Gated loudness since play. Pre-master mix target: roughly -23 to -16 LUFS, leaving room for mastering." />
            <LufsRow label="True peak" value={l.truePeakDb} target={[-60, -3]} hint="Peak including inter-sample overs. Leave at least 3-6 dB headroom when sending to mastering." />
          </div>
          <p className="font-cond text-[10.5px] leading-snug text-dim">
            Green is in range for a mix headed to mastering. Yellow means too loud or too quiet.
          </p>
        </div>
        <div className="flex w-[78px] flex-col items-center justify-end gap-1.5">
          <div className="flex w-full gap-[3px]">
            <DbReadout db={mix.masterDb} />
            <PeakReadout read={() => engine.masterProbe?.levels().peakDb ?? -120} />
          </div>
          <div className="flex items-end gap-1">
            <Fader value={mix.masterDb} onChange={(v) => setMix({ masterDb: v })} height={STRIP_FADER_H} />
            <Meter width={11} height={STRIP_FADER_H} read={() => engine.masterProbe?.levels() ?? SILENT} />
          </div>
          <div className="h-[18px] w-full text-center readout text-[10px] text-dim">{fmtDb(mix.masterDb)} dB</div>
          <NamePlate name="Stereo Out" />
        </div>
      </div>
    </div>
  )
}
