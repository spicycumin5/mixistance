// Channel strip: trim → EQ → comp → pan → fader → mute → bus, with post-fader sends.

import { DEFAULT_EQ } from '../dsp/biquad'
import type { ChannelState } from '../state/types'
import { dbToGain, LevelProbe } from './analysis'
import { EqChain } from './eq'
import { InsertSlot } from './insertSlot'

export class ChannelStrip {
  readonly input: GainNode
  readonly eq: EqChain
  readonly eqSlot: InsertSlot
  readonly compSlot: InsertSlot
  readonly probe: LevelProbe
  readonly preProbe: LevelProbe
  readonly compProbe: LevelProbe
  private comp: AudioWorkletNode
  private panner: StereoPannerNode
  private fader: GainNode
  private muteGain: GainNode
  private reverbSend: GainNode
  private delaySend: GainNode
  /** Latest compressor gain reduction in dB (positive). */
  gr = 0
  /** Deepest gain reduction seen over roughly the last 3 seconds. */
  grRecentMax = 0
  private grMaxAt = 0

  constructor(
    private ctx: AudioContext,
    bus: AudioNode,
    reverbIn: AudioNode,
    delayIn: AudioNode,
  ) {
    this.input = ctx.createGain()
    this.eq = new EqChain(ctx, DEFAULT_EQ.length)
    this.eqSlot = new InsertSlot(ctx, this.eq.input, this.eq.output)
    this.comp = new AudioWorkletNode(ctx, 'mx-compressor', { outputChannelCount: [2] })
    this.comp.port.onmessage = (e: MessageEvent<{ gr: number }>) => {
      this.gr = e.data.gr
      const now = performance.now()
      if (this.gr >= this.grRecentMax || now - this.grMaxAt > 3000) {
        this.grRecentMax = this.gr
        this.grMaxAt = now
      }
    }
    this.compSlot = new InsertSlot(ctx, this.comp, this.comp)
    this.panner = ctx.createStereoPanner()
    this.fader = ctx.createGain()
    this.muteGain = ctx.createGain()
    this.reverbSend = ctx.createGain()
    this.delaySend = ctx.createGain()
    this.probe = new LevelProbe(ctx)
    this.preProbe = new LevelProbe(ctx)
    this.compProbe = new LevelProbe(ctx, 1024)

    this.input.connect(this.eqSlot.input)
    this.input.connect(this.preProbe.node)
    this.eqSlot.output.connect(this.compSlot.input)
    this.eqSlot.output.connect(this.compProbe.node)
    this.compSlot.output.connect(this.panner).connect(this.fader).connect(this.muteGain)
    this.muteGain.connect(bus)
    this.muteGain.connect(this.probe.node)
    this.muteGain.connect(this.reverbSend).connect(reverbIn)
    this.muteGain.connect(this.delaySend).connect(delayIn)
  }

  apply(s: ChannelState, audible: boolean) {
    const t = this.ctx.currentTime
    const k = 0.01
    this.input.gain.setTargetAtTime(dbToGain(s.gainDb), t, k)
    this.eq.set(s.eq)
    this.eqSlot.setBypass(!s.eqOn)
    this.comp.port.postMessage({ params: s.comp })
    this.compSlot.setBypass(!s.compOn)
    this.panner.pan.setTargetAtTime(s.pan, t, k)
    this.fader.gain.setTargetAtTime(dbToGain(s.faderDb), t, k)
    this.muteGain.gain.setTargetAtTime(audible ? 1 : 0, t, k)
    this.reverbSend.gain.setTargetAtTime(dbToGain(s.reverbSendDb), t, k)
    this.delaySend.gain.setTargetAtTime(dbToGain(s.delaySendDb), t, k)
  }

  dispose() {
    this.input.disconnect()
    this.muteGain.disconnect()
  }
}
