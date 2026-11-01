import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import { SEND_OFF_DB, type ChannelState } from '../../state/types'
import { Fader } from '../components/Fader'
import { Knob } from '../components/Knob'
import { Meter } from '../components/Meter'
import { fmtDb, fmtPan } from '../format'

const SILENT = { peakDb: -120, rmsDb: -120 }

export function ChannelStripView({ ch }: { ch: ChannelState }) {
  const selected = useStore((s) => s.selectedId === ch.id)
  const { select, setChannel, removeChannel } = useStore.getState()
  const sendFmt = (v: number) => (v <= SEND_OFF_DB ? 'off' : fmtDb(v, 0))

  return (
    <div
      onClick={() => select(ch.id)}
      className={`group flex w-[92px] shrink-0 cursor-pointer flex-col items-center gap-2 rounded-lg border p-2 transition ${
        selected ? 'border-amber/70 bg-panel-2' : 'border-line bg-panel hover:border-zinc-600'
      }`}
    >
      <div className="flex w-full items-center gap-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
        <span className="truncate text-xs font-semibold" title={ch.name}>{ch.name}</span>
        <button
          className="ml-auto hidden text-[10px] text-dim hover:text-bad group-hover:block"
          title="Remove channel"
          onClick={(e) => { e.stopPropagation(); removeChannel(ch.id) }}
        >✕</button>
      </div>
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          className={`chip ${ch.eqOn ? 'bg-sky-500 text-black' : 'bg-panel-3 text-dim'}`}
          onClick={() => setChannel(ch.id, { eqOn: !ch.eqOn })}
          title="EQ in/out"
        >EQ</button>
        <button
          className={`chip ${ch.compOn ? 'bg-amber text-black' : 'bg-panel-3 text-dim'}`}
          onClick={() => setChannel(ch.id, { compOn: !ch.compOn })}
          title="Compressor in/out"
        >CMP</button>
      </div>
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Knob size={30} label="Verb" min={SEND_OFF_DB} max={0} defaultValue={SEND_OFF_DB} value={ch.reverbSendDb} format={sendFmt} color="#a78bfa" onChange={(v) => setChannel(ch.id, { reverbSendDb: v })} />
        <Knob size={30} label="Dly" min={SEND_OFF_DB} max={0} defaultValue={SEND_OFF_DB} value={ch.delaySendDb} format={sendFmt} color="#22d3ee" onChange={(v) => setChannel(ch.id, { delaySendDb: v })} />
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Knob size={34} label="Pan" min={-1} max={1} defaultValue={0} value={ch.pan} step={0.01} format={fmtPan} onChange={(v) => setChannel(ch.id, { pan: v })} />
      </div>
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          className={`chip w-7 ${ch.mute ? 'bg-bad text-black' : 'bg-panel-3 text-dim'}`}
          onClick={() => setChannel(ch.id, { mute: !ch.mute })}
        >M</button>
        <button
          className={`chip w-7 ${ch.solo ? 'bg-warn text-black' : 'bg-panel-3 text-dim'}`}
          onClick={(e) => {
            // Alt/Cmd-click = exclusive solo, a common DAW convention.
            if (e.altKey || e.metaKey) {
              const st = useStore.getState()
              st.mix.channels.forEach((c) => st.setChannel(c.id, { solo: c.id === ch.id ? !ch.solo : false }))
            } else setChannel(ch.id, { solo: !ch.solo })
          }}
          title="Solo (alt-click: exclusive)"
        >S</button>
      </div>
      <div className="flex items-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Fader value={ch.faderDb} onChange={(v) => setChannel(ch.id, { faderDb: v })} height={150} />
        <Meter height={150} read={() => engine.strips.get(ch.id)?.probe.levels() ?? SILENT} />
      </div>
      <div className="readout text-[11px]">{fmtDb(ch.faderDb)} dB</div>
    </div>
  )
}
