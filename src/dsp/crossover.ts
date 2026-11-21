// Linkwitz-Riley 4th-order crossover (two cascaded Butterworth biquads per side).
// The low and high outputs of an LR4 split sum to an allpass, so the bands rebuild the
// original magnitude response exactly.

export interface BiquadCoefs { b0: number; b1: number; b2: number; a1: number; a2: number }

/** RBJ cookbook Butterworth (Q = 1/√2) lowpass or highpass. */
export function butter2(type: 'lowpass' | 'highpass', freq: number, fs: number): BiquadCoefs {
  const w0 = (2 * Math.PI * freq) / fs
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const a0 = 1 + alpha
  const k = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
  const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos)
  return { b0: k / a0, b1: b1 / a0, b2: k / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }
}

/** Transposed direct form II, in a new array. */
export function biquad(x: Float32Array, c: BiquadCoefs): Float32Array {
  const y = new Float32Array(x.length)
  let z1 = 0, z2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = x[i]
    const o = c.b0 * v + z1
    z1 = c.b1 * v - c.a1 * o + z2
    z2 = c.b2 * v - c.a2 * o
    y[i] = o
  }
  return y
}

export function lr4(x: Float32Array, type: 'lowpass' | 'highpass', freq: number, fs: number): Float32Array {
  const c = butter2(type, freq, fs)
  return biquad(biquad(x, c), c)
}

/** Magnitude (dB) of an LR4 low or high side at f. Each side is -6 dB at the crossover. */
export function lr4MagDb(type: 'lowpass' | 'highpass', fc: number, f: number): number {
  // |Butterworth2| = 1/sqrt(1+(f/fc)^4) for LP. LR4 is that squared.
  const r = (f / fc) ** 4
  const amp = type === 'lowpass' ? 1 / (1 + r) : r / (1 + r)
  return 20 * Math.log10(Math.max(amp, 1e-9))
}

/** Split into low / mid / high. The low band goes through an LR4 allpass at f2, so the three bands stay phase-aligned. */
export function split3(x: Float32Array, f1: number, f2: number, fs: number): [Float32Array, Float32Array, Float32Array] {
  const lowRaw = lr4(x, 'lowpass', f1, fs)
  const rest = lr4(x, 'highpass', f1, fs)
  const mid = lr4(rest, 'lowpass', f2, fs)
  const high = lr4(rest, 'highpass', f2, fs)
  const apL = lr4(lowRaw, 'lowpass', f2, fs)
  const apH = lr4(lowRaw, 'highpass', f2, fs)
  const low = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) low[i] = apL[i] + apH[i]
  return [low, mid, high]
}
