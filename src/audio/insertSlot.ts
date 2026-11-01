// A processor slot with click-free bypass and optional loudness-matched A/B.
//
//   input ─┬─> [processor] ─> levelMatch(in0) ─> wet ─┬─> output
//          ├────────────────> levelMatch(in1)         │
//          └────────────────────────────────> dry ────┘

const RAMP = 0.015

export class InsertSlot {
  readonly input: GainNode
  readonly output: GainNode
  private wet: GainNode
  private dry: GainNode
  private matcher: AudioWorkletNode
  private bypassed = false

  constructor(
    private ctx: AudioContext,
    procIn: AudioNode,
    procOut: AudioNode,
  ) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.wet = ctx.createGain()
    this.dry = ctx.createGain()
    this.dry.gain.value = 0
    this.matcher = new AudioWorkletNode(ctx, 'mx-levelmatch', {
      numberOfInputs: 2,
      outputChannelCount: [2],
    })
    this.matcher.port.postMessage({ enabled: false })
    this.input.connect(procIn)
    procOut.connect(this.matcher, 0, 0)
    this.input.connect(this.matcher, 0, 1)
    this.matcher.connect(this.wet).connect(this.output)
    this.input.connect(this.dry).connect(this.output)
  }

  setBypass(b: boolean) {
    if (b === this.bypassed) return
    this.bypassed = b
    const t = this.ctx.currentTime
    this.wet.gain.setTargetAtTime(b ? 0 : 1, t, RAMP)
    this.dry.gain.setTargetAtTime(b ? 1 : 0, t, RAMP)
  }

  setLevelMatch(on: boolean) {
    this.matcher.port.postMessage({ enabled: on })
  }

  disconnect() {
    this.output.disconnect()
  }
}
