import type { EqBand } from '../dsp/biquad'

export class EqChain {
  readonly filters: BiquadFilterNode[]
  readonly input: AudioNode
  readonly output: AudioNode

  constructor(
    private ctx: BaseAudioContext,
    bandCount: number,
  ) {
    this.filters = Array.from({ length: bandCount }, () => ctx.createBiquadFilter())
    for (let i = 1; i < bandCount; i++) this.filters[i - 1].connect(this.filters[i])
    this.input = this.filters[0]
    this.output = this.filters[bandCount - 1]
  }

  set(bands: EqBand[]) {
    const t = this.ctx.currentTime
    const nyquist = this.ctx.sampleRate / 2
    bands.forEach((b, i) => {
      const f = this.filters[i]
      if (!f) return
      f.type = b.type
      // Disabled bands are made transparent rather than disconnected.
      let freq = b.freq
      let gain = b.gainDb
      if (!b.enabled) {
        gain = 0
        if (b.type === 'highpass') freq = 1
        if (b.type === 'lowpass') freq = nyquist
      }
      f.frequency.setTargetAtTime(Math.min(freq, nyquist), t, 0.01)
      f.gain.setTargetAtTime(gain, t, 0.01)
      f.Q.setTargetAtTime(b.q, t, 0.01)
    })
  }
}
