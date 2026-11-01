// RBJ Audio EQ Cookbook magnitude responses. Mirrors Web Audio BiquadFilterNode so
// EQ curves can be compared/scored without an AudioContext.

export type BandType = 'highpass' | 'lowshelf' | 'peaking' | 'highshelf' | 'lowpass'

export interface EqBand {
  type: BandType
  freq: number
  gainDb: number
  q: number
  enabled: boolean
}

export function bandMagnitudeDb(band: EqBand, f: number, fs = 48000): number {
  if (!band.enabled) return 0
  const w0 = (2 * Math.PI * band.freq) / fs
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const A = Math.pow(10, band.gainDb / 40)
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
  switch (band.type) {
    case 'peaking': {
      const alpha = sin / (2 * band.q)
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A
      break
    }
    case 'lowshelf': {
      // Web Audio shelves use a fixed slope S = 1.
      const alpha = (sin / 2) * Math.sqrt(2)
      const s = 2 * Math.sqrt(A) * alpha
      b0 = A * (A + 1 - (A - 1) * cos + s); b1 = 2 * A * (A - 1 - (A + 1) * cos); b2 = A * (A + 1 - (A - 1) * cos - s)
      a0 = A + 1 + (A - 1) * cos + s; a1 = -2 * (A - 1 + (A + 1) * cos); a2 = A + 1 + (A - 1) * cos - s
      break
    }
    case 'highshelf': {
      const alpha = (sin / 2) * Math.sqrt(2)
      const s = 2 * Math.sqrt(A) * alpha
      b0 = A * (A + 1 + (A - 1) * cos + s); b1 = -2 * A * (A - 1 + (A + 1) * cos); b2 = A * (A + 1 + (A - 1) * cos - s)
      a0 = A + 1 - (A - 1) * cos + s; a1 = 2 * (A - 1 - (A + 1) * cos); a2 = A + 1 - (A - 1) * cos - s
      break
    }
    case 'highpass': {
      const alpha = sin / (2 * band.q)
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    }
    case 'lowpass': {
      const alpha = sin / (2 * band.q)
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    }
  }
  const w = (2 * Math.PI * f) / fs
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w)
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2)
  const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2)
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di))
}

export const curveDb = (bands: EqBand[], f: number, fs?: number) =>
  bands.reduce((sum, b) => sum + bandMagnitudeDb(b, f, fs), 0)

/** Log-spaced frequencies from 20 Hz to 20 kHz. */
export function logFreqs(n: number, lo = 20, hi = 20000): number[] {
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)))
}

/** RMS difference in dB between two EQ curves over the audible band. */
export function curveDistanceDb(a: EqBand[], b: EqBand[]): number {
  const fs = logFreqs(96, 30, 16000)
  const sq = fs.map((f) => (curveDb(a, f) - curveDb(b, f)) ** 2)
  return Math.sqrt(sq.reduce((x, y) => x + y, 0) / sq.length)
}

export const DEFAULT_EQ: EqBand[] = [
  { type: 'highpass', freq: 30, gainDb: 0, q: 0.707, enabled: false },
  { type: 'lowshelf', freq: 120, gainDb: 0, q: 0.707, enabled: true },
  { type: 'peaking', freq: 400, gainDb: 0, q: 1.2, enabled: true },
  { type: 'peaking', freq: 2500, gainDb: 0, q: 1.2, enabled: true },
  { type: 'highshelf', freq: 8000, gainDb: 0, q: 0.707, enabled: true },
  { type: 'lowpass', freq: 20000, gainDb: 0, q: 0.707, enabled: false },
]
