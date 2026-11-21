// 3-band compressor: LR4 split, compress each band on its own, sum.

import { renderCompressor, type CompressorParams } from './compressorCore'
import { split3 } from './crossover'

export interface MultibandParams {
  lowXover: number
  highXover: number
  lowThresh: number
  midThresh: number
  highThresh: number
  ratio: number
  attackMs: number
  releaseMs: number
  /** 0 = all bands, 1-3 = solo low / mid / high. */
  solo: number
}

export const DEFAULT_MULTIBAND: MultibandParams = {
  lowXover: 200, highXover: 3000, lowThresh: -24, midThresh: -18, highThresh: -24,
  ratio: 4, attackMs: 10, releaseMs: 120, solo: 0,
}

export interface MultibandRender {
  out: Float32Array
  /** Uncompressed bands (for display / dry solo). */
  bands: [Float32Array, Float32Array, Float32Array]
  compressed: [Float32Array, Float32Array, Float32Array]
  gainDb: [Float32Array, Float32Array, Float32Array]
}

export function renderMultiband(input: Float32Array, fs: number, p: MultibandParams): MultibandRender {
  const hi = Math.max(p.highXover, p.lowXover * 1.5)
  const bands = split3(input, p.lowXover, hi, fs)
  const th = [p.lowThresh, p.midThresh, p.highThresh]
  const res = bands.map((b, k) => {
    const cp: CompressorParams = { thresholdDb: th[k], ratio: p.ratio, attackMs: p.attackMs, releaseMs: p.releaseMs, kneeDb: 6, makeupDb: 0 }
    return renderCompressor(b, fs, cp)
  })
  const out = new Float32Array(input.length)
  for (let k = 0; k < 3; k++) {
    if (p.solo && p.solo !== k + 1) continue
    const o = res[k].out
    for (let i = 0; i < out.length; i++) out[i] += o[i]
  }
  return {
    out,
    bands,
    compressed: res.map((r) => r.out) as MultibandRender['compressed'],
    gainDb: res.map((r) => r.gainDb) as MultibandRender['gainDb'],
  }
}
