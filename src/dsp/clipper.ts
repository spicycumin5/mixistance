// Static waveshapers: hard clip, soft clip (tanh) and asymmetric soft clip.
// They are memoryless, so the transfer curve tells the whole story.

import { fromDb } from './compressorCore'

export type ClipMode = 'hard' | 'soft' | 'asym'

export interface ClipperParams {
  driveDb: number
  ceilingDb: number
  mode: ClipMode
}

export const DEFAULT_CLIPPER: ClipperParams = { driveDb: 6, ceilingDb: -3, mode: 'hard' }

/** Normalised shape: input and output in units of the ceiling. */
export function shape(u: number, mode: ClipMode): number {
  switch (mode) {
    case 'hard':
      return u > 1 ? 1 : u < -1 ? -1 : u
    case 'soft':
      return Math.tanh(u)
    case 'asym':
      // The negative half bends earlier than the positive half. That asymmetry is what
      // adds even harmonics (2nd, 4th), like a tube stage.
      return u >= 0 ? Math.tanh(u) : Math.tanh(1.8 * u) / 1.8
  }
}

/** Output sample for an input sample (linear, full scale = 1). */
export function clipTransfer(x: number, p: ClipperParams): number {
  const c = fromDb(p.ceilingDb)
  return c * shape((x * fromDb(p.driveDb)) / c, p.mode)
}

export function renderClipper(input: Float32Array, p: ClipperParams): Float32Array {
  const c = fromDb(p.ceilingDb)
  const k = fromDb(p.driveDb) / c
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) out[i] = c * shape(input[i] * k, p.mode)
  return out
}

/**
 * Per-sample gain change (dB) a clipper applies: out/(in·drive). This shows how
 * clipping acts on individual samples, where a compressor or limiter moves a smooth
 * envelope.
 */
export function clipGainDb(input: Float32Array, out: Float32Array, driveDb: number): Float32Array {
  const d = fromDb(driveDb)
  const g = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const x = input[i] * d
    g[i] = Math.abs(x) < 1e-6 ? 0 : Math.min(0, 20 * Math.log10(Math.max(Math.abs(out[i] / x), 1e-9)))
  }
  return g
}
