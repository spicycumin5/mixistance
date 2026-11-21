import { engine } from '../../audio/engine'
import { useStore } from '../../state/store'
import { SEND_OFF_DB, type ChannelState } from '../../state/types'
import { Fader } from '../components/Fader'
import { Knob } from '../components/Knob'
import { Meter } from '../components/Meter'
import { fmtDb, fmtPan } from '../format'
import { DbReadout, EqThumb, NamePlate, PeakReadout, SILENT, Slot } from './stripParts'

export const STRIP_FADER_H = 168

export function ChannelStripView({ ch }: { ch: ChannelState }) {
  const selected = useStore((s) => s.selectedId === ch.id)
  const { select, setChannel, removeChannel } = useStore.getState()
  const sendFmt = (v: number) => (v <= SEND_OFF_DB ? 'off' : fmtDb(v, 0))
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation()

  return (
    <div
      onClick={() => select(ch.id)}
      className="surface group flex w-[86px] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-[4px] px-1.5 pb-1.5 pt-2"
      style={selected ? { background: 'var(--color-panel-2)', borderColor: '#6a6a6a' } : undefined}
    >
      <EqThumb bands={ch.eq} on={ch.eqOn} onClick={() => select(ch.id)} />

      <div className="flex w-full flex-col gap-[3px]" onClick={stop}>
        <Slot label="EQ" lit={ch.eqOn} title="Click to switch the EQ in or out" onClick={() => setChannel(ch.id, { eqOn: !ch.eqOn })} />
        <Slot label="Comp" lit={ch.compOn} title="Click to switch the compressor in or out" onClick={() => setChannel(ch.id, { compOn: !ch.compOn })} />
      </div>

      <div className="flex w-full flex-col gap-[3px]" onClick={stop}>
        <Slot
          label="Reverb"
          title={`Reverb send: ${sendFmt(ch.reverbSendDb)}`}
          right={<Knob bare size={16} label="Reverb send" min={SEND_OFF_DB} max={0} defaultValue={SEND_OFF_DB} value={ch.reverbSendDb} format={sendFmt} onChange={(v) => setChannel(ch.id, { reverbSendDb: v })} />}
        />
        <Slot
          label="Delay"
          title={`Delay send: ${sendFmt(ch.delaySendDb)}`}
          right={<Knob bare size={16} label="Delay send" min={SEND_OFF_DB} max={0} defaultValue={SEND_OFF_DB} value={ch.delaySendDb} format={sendFmt} onChange={(v) => setChannel(ch.id, { delaySendDb: v })} />}
        />
      </div>

      <Slot label="Stereo Out" title="Output" />

      <div className="flex w-full items-center justify-between px-0.5" onClick={stop}>
        <Knob bare size={30} label="Pan" min={-1} max={1} defaultValue={0} value={ch.pan} step={0.01} format={fmtPan} onChange={(v) => setChannel(ch.id, { pan: v })} />
        <span className="readout text-[10px] text-dim">{fmtPan(ch.pan)}</span>
      </div>

      <div className="flex w-full gap-[3px]">
        <DbReadout db={ch.faderDb} />
        <PeakReadout read={() => engine.strips.get(ch.id)?.probe.levels().peakDb ?? -120} />
      </div>

      <div className="flex items-end gap-1" onClick={stop}>
        <Fader value={ch.faderDb} onChange={(v) => setChannel(ch.id, { faderDb: v })} height={STRIP_FADER_H} />
        <Meter width={7} height={STRIP_FADER_H} read={() => engine.strips.get(ch.id)?.probe.levels() ?? SILENT} />
      </div>

      <div className="grid w-full grid-cols-2 gap-[3px]" onClick={stop}>
        <button
          type="button"
          className="key"
          aria-pressed={ch.mute}
          title="Mute"
          style={ch.mute ? { background: 'var(--color-mute)', color: '#0b1f33', borderColor: 'var(--color-mute)' } : undefined}
          onClick={() => setChannel(ch.id, { mute: !ch.mute })}
        >M</button>
        <button
          type="button"
          className="key"
          aria-pressed={ch.solo}
          title="Solo (alt-click: exclusive)"
          style={ch.solo ? { background: 'var(--color-solo)', color: '#2b2200', borderColor: 'var(--color-solo)' } : undefined}
          onClick={(e) => {
            // Alt/Cmd-click = exclusive solo, a common DAW convention.
            if (e.altKey || e.metaKey) {
              const st = useStore.getState()
              st.mix.channels.forEach((c) => st.setChannel(c.id, { solo: c.id === ch.id ? !ch.solo : false }))
            } else setChannel(ch.id, { solo: !ch.solo })
          }}
        >S</button>
      </div>

      <NamePlate name={ch.name} color={ch.color}>
        <button
          type="button"
          className="absolute right-0.5 hidden h-4 w-4 items-center justify-center rounded-sm text-[10px] text-dim hover:bg-white/10 hover:text-ink group-hover:flex"
          title="Remove channel"
          aria-label={`Remove ${ch.name}`}
          onClick={(e) => { e.stopPropagation(); removeChannel(ch.id) }}
        >✕</button>
      </NamePlate>
    </div>
  )
}
