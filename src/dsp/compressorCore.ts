// Feed-forward log-domain compressor (Giannoulis, Massberg & Reiss, JAES 2012).
// Pure DSP so it can run in an AudioWorklet and be unit tested in Node.

export interface CompressorParams {
  thresholdDb: number
  ratio: number
  attackMs: number
  releaseMs: number
  kneeDb: number
  makeupDb: number
}

export const DEFAULT_COMP: CompressorParams = {
  thresholdDb: -18,
  ratio: 4,
  attackMs: 10,
  releaseMs: 120,
  kneeDb: 6,
  makeupDb: 0,
}

const EPS = 1e-9

export const toDb = (x: number) => 20 * Math.log10(Math.max(Math.abs(x), EPS))
export const fromDb = (db: number) => Math.pow(10, db / 20)

/** Static curve: output level (dB) for an input level (dB), before makeup. */
export function staticCurve(inDb: number, p: Pick<CompressorParams, 'thresholdDb' | 'ratio' | 'kneeDb'>): number {
  const { thresholdDb: T, ratio: R, kneeDb: W } = p
  const over = inDb - T
  if (2 * over < -W) return inDb
  if (W > 0 && 2 * Math.abs(over) <= W) {
    return inDb + ((1 / R - 1) * (over + W / 2) ** 2) / (2 * W)
  }
  return T + over / R
}

/** One-pole coefficient so a step settles to ~63% in `ms`. */
export const timeCoef = (ms: number, sampleRate: number) =>
  ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * sampleRate))

export class CompressorCore {
  private p: CompressorParams = { ...DEFAULT_COMP }
  private aA = 0
  private aR = 0
  private gainDb = 0 // smoothed gain reduction, <= 0
  /** Deepest gain reduction (dB, positive) since last read. */
  peakGr = 0

  constructor(private sampleRate: number) {
    this.set({})
  }

  set(p: Partial<CompressorParams>) {
    this.p = { ...this.p, ...p }
    this.aA = timeCoef(this.p.attackMs, this.sampleRate)
    this.aR = timeCoef(this.p.releaseMs, this.sampleRate)
  }

  get params() {
    return this.p
  }

  /**
   * Process stereo-linked blocks in place. `channels` may hold 1 or 2 arrays.
   */
  process(channels: Float32Array[]) {
    const n = channels[0]?.length ?? 0
    const makeup = fromDb(this.p.makeupDb)
    for (let i = 0; i < n; i++) {
      let peak = 0
      for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i]))
      const inDb = toDb(peak)
      const target = staticCurve(inDb, this.p) - inDb // <= 0
      // Smoothed branching detector: attack when reduction deepens.
      const a = target < this.gainDb ? this.aA : this.aR
      this.gainDb = a * this.gainDb + (1 - a) * target
      const g = fromDb(this.gainDb) * makeup
      for (const ch of channels) ch[i] *= g
      if (-this.gainDb > this.peakGr) this.peakGr = -this.gainDb
    }
  }

  readGr() {
    const gr = this.peakGr
    this.peakGr = 0
    return gr
  }
}
