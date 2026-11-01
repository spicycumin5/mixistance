// Level/spectrum helpers over AnalyserNodes.

export const dbToGain = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20))

export class LevelProbe {
  readonly node: AnalyserNode
  private buf: Float32Array<ArrayBuffer>
  private spec: Float32Array<ArrayBuffer>

  constructor(ctx: BaseAudioContext, fftSize = 4096) {
    this.node = ctx.createAnalyser()
    this.node.fftSize = fftSize
    this.node.smoothingTimeConstant = 0.75
    this.buf = new Float32Array(fftSize)
    this.spec = new Float32Array(fftSize / 2)
  }

  /** Peak and RMS of the latest window, in dBFS. */
  levels() {
    this.node.getFloatTimeDomainData(this.buf)
    let peak = 0
    let sum = 0
    for (const x of this.buf) {
      const a = Math.abs(x)
      if (a > peak) peak = a
      sum += x * x
    }
    const rms = Math.sqrt(sum / this.buf.length)
    return { peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 20 * Math.log10(rms || 1e-9) }
  }

  spectrum() {
    this.node.getFloatFrequencyData(this.spec)
    return this.spec
  }

  binHz() {
    return this.node.context.sampleRate / this.node.fftSize
  }
}

/** Octave-ish analysis bands, used for feedback snapshots. */
export const ANALYSIS_BANDS: [string, number, number][] = [
  ['sub 20-60', 20, 60],
  ['bass 60-150', 60, 150],
  ['low-mid 150-400', 150, 400],
  ['mid 400-1k', 400, 1000],
  ['upper-mid 1k-3k', 1000, 3000],
  ['presence 3k-6k', 3000, 6000],
  ['brilliance 6k-12k', 6000, 12000],
  ['air 12k-20k', 12000, 20000],
]

/** Average dB per analysis band from an AnalyserNode spectrum. */
export function bandEnergies(spec: Float32Array, binHz: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [name, lo, hi] of ANALYSIS_BANDS) {
    let p = 0
    let n = 0
    for (let i = Math.ceil(lo / binHz); i <= Math.floor(hi / binHz) && i < spec.length; i++) {
      p += Math.pow(10, spec[i] / 10)
      n++
    }
    out[name] = n && p > 0 ? Math.round(10 * Math.log10(p / n) * 10) / 10 : -120
  }
  return out
}
