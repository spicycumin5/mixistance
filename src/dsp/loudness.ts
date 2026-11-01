// ITU-R BS.1770-4 / EBU R128 loudness meter: momentary, short-term, integrated LUFS
// plus 4x-oversampled true peak. Pure DSP shared by the worklet and tests.

interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number
}

/** K-weighting filter coefficients for any sample rate (libebur128 derivation). */
export function kWeighting(fs: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533
  const G = 3.999843853973347
  let Q = 0.7071752369554196
  let K = Math.tan((Math.PI * f0) / fs)
  const Vh = Math.pow(10, G / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  let a0 = 1 + K / Q + K * K
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  }
  f0 = 38.13547087602444
  Q = 0.5003270373238773
  K = Math.tan((Math.PI * f0) / fs)
  a0 = 1 + K / Q + K * K
  const hp: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 }
  return [shelf, hp]
}

class BiquadState {
  x1 = 0; x2 = 0; y1 = 0; y2 = 0
  constructor(private c: Biquad) {}
  tick(x: number) {
    const { b0, b1, b2, a1, a2 } = this.c
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }
}

// 4x polyphase interpolator: 48-tap windowed sinc, 12 taps per phase.
const OS = 4
const TAPS_PER_PHASE = 12
const PHASES: number[][] = (() => {
  const N = OS * TAPS_PER_PHASE
  const h: number[] = []
  for (let n = 0; n < N; n++) {
    const t = (n - (N - 1) / 2) / OS
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (n + 0.5)) / N)
    h.push(sinc * w)
  }
  return Array.from({ length: OS }, (_, p) => h.filter((_, n) => n % OS === p))
})()

export const lufsFromPower = (power: number) => (power <= 0 ? -Infinity : -0.691 + 10 * Math.log10(power))

export interface LoudnessReading {
  momentary: number
  shortTerm: number
  integrated: number
  truePeakDb: number
}

export class LoudnessMeter {
  private filters: [BiquadState, BiquadState][] = []
  private hist: number[][] = []
  private hop: number // samples per 100 ms
  private acc: number[] // per-channel sum of squares in current hop
  private count = 0
  private hops: number[] = [] // mean-square power (channel-summed) per 100 ms hop, recent 30
  private blocks: number[] = [] // gated-candidate 400 ms block powers for integration
  private tpMax = 0

  constructor(fs: number, private numChannels = 2) {
    this.hop = Math.round(fs / 10)
    this.acc = new Array(numChannels).fill(0)
    for (let c = 0; c < numChannels; c++) {
      const [s, h] = kWeighting(fs)
      this.filters.push([new BiquadState(s), new BiquadState(h)])
      this.hist.push(new Array(TAPS_PER_PHASE).fill(0))
    }
  }

  reset() {
    this.hops = []
    this.blocks = []
    this.tpMax = 0
  }

  process(channels: Float32Array[]) {
    const n = channels[0]?.length ?? 0
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.numChannels; c++) {
        const x = channels[c] ? channels[c][i] : channels[0][i]
        const [s, h] = this.filters[c]
        const y = h.tick(s.tick(x))
        this.acc[c] += y * y
        // true peak
        const hist = this.hist[c]
        hist.pop(); hist.unshift(x)
        for (const phase of PHASES) {
          let v = 0
          for (let k = 0; k < TAPS_PER_PHASE; k++) v += phase[k] * hist[k]
          const a = Math.abs(v)
          if (a > this.tpMax) this.tpMax = a
        }
      }
      if (++this.count === this.hop) this.endHop()
    }
  }

  private endHop() {
    let p = 0
    for (let c = 0; c < this.numChannels; c++) {
      p += this.acc[c] / this.hop
      this.acc[c] = 0
    }
    this.count = 0
    this.hops.push(p)
    if (this.hops.length > 30) this.hops.shift()
    if (this.hops.length >= 4) this.blocks.push(this.mean(4))
  }

  private mean(k: number) {
    const s = this.hops.slice(-k)
    return s.reduce((a, b) => a + b, 0) / s.length
  }

  integrated() {
    const abs = this.blocks.filter((b) => lufsFromPower(b) > -70)
    if (!abs.length) return -Infinity
    const relGate = lufsFromPower(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
    const rel = abs.filter((b) => lufsFromPower(b) > relGate)
    if (!rel.length) return -Infinity
    return lufsFromPower(rel.reduce((a, b) => a + b, 0) / rel.length)
  }

  read(): LoudnessReading {
    return {
      momentary: this.hops.length >= 4 ? lufsFromPower(this.mean(4)) : -Infinity,
      shortTerm: this.hops.length >= 30 ? lufsFromPower(this.mean(30)) : -Infinity,
      integrated: this.integrated(),
      truePeakDb: this.tpMax > 0 ? 20 * Math.log10(this.tpMax) : -Infinity,
    }
  }
}
