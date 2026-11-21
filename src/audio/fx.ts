// Send effects: algorithmic-IR reverb and a tempo-synced filtered delay.

export interface ReverbIROptions {
  /** 0-1: how much faster highs decay than lows. 0.5 matches the mixer's reverb. */
  damping?: number
  /** 0-1: level of discrete early reflections. 0 (the default) means none. */
  early?: number
  /** Noise source returning [0, 1) like Math.random. Pass a seeded one for repeatable IRs. */
  random?: () => number
}

export function makeReverbIR(ctx: BaseAudioContext, decaySec: number, preDelayMs = 18, opts: ReverbIROptions = {}): AudioBuffer {
  const fs = ctx.sampleRate
  const rand = opts.random ?? Math.random
  const darken = decaySec * 0.35 * Math.pow(4, 1 - 2 * (opts.damping ?? 0.5))
  const len = Math.floor(fs * (decaySec + preDelayMs / 1000))
  const ir = ctx.createBuffer(2, len, fs)
  const pre = Math.floor((fs * preDelayMs) / 1000)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / fs
      // -60 dB at decaySec; high frequencies decay faster via a darkening lowpass.
      const env = Math.pow(10, (-3 * t) / decaySec)
      const k = 0.15 + 0.8 * Math.exp(-t / darken)
      lp += k * ((rand() * 2 - 1) - lp)
      d[i] = lp * env
    }
    // Early reflections: a few distinct echoes off nearby walls, 5-70 ms after pre-delay.
    if (opts.early) {
      for (let k = 0; k < 10; k++) {
        const ms = 5 + k * 6.5 + rand() * 5
        const i = pre + Math.floor((ms / 1000) * fs)
        if (i < len) d[i] += opts.early * (rand() > 0.5 ? 1 : -1) * 0.9 * Math.pow(0.82, k)
      }
    }
  }
  return ir
}

export class ReverbBus {
  readonly input: GainNode
  readonly output: GainNode
  private conv: ConvolverNode
  private decay = 0

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.conv = ctx.createConvolver()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180 // keep low end out of the verb, a standard mix move
    this.input.connect(hp).connect(this.conv).connect(this.output)
  }

  setDecay(sec: number) {
    if (Math.abs(sec - this.decay) < 0.05) return
    this.decay = sec
    this.conv.buffer = makeReverbIR(this.ctx, sec)
  }
}

export class DelayBus {
  readonly input: GainNode
  readonly output: GainNode
  private delay: DelayNode
  private fb: GainNode

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.delay = ctx.createDelay(4)
    this.fb = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 4500
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 250
    this.input.connect(hp).connect(this.delay)
    this.delay.connect(lp).connect(this.fb).connect(this.delay)
    lp.connect(this.output)
  }

  set(bpm: number, beats: number, feedback: number) {
    const t = this.ctx.currentTime
    this.delay.delayTime.setTargetAtTime(Math.min(4, (60 / bpm) * beats), t, 0.05)
    this.fb.gain.setTargetAtTime(Math.min(0.9, feedback), t, 0.02)
  }
}
