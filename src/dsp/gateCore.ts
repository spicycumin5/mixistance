// Downward expander / noise gate. Below threshold the level is pushed down further
// (by `ratio`), never more than `range` dB. Hold keeps the gate open briefly after the
// signal drops, so it doesn't chatter on decays.

import { timeCoef, toDb } from './compressorCore'

export interface GateParams {
  thresholdDb: number
  ratio: number
  rangeDb: number
  attackMs: number
  holdMs: number
  releaseMs: number
}

export const DEFAULT_GATE: GateParams = { thresholdDb: -35, ratio: 20, rangeDb: 40, attackMs: 1, holdMs: 40, releaseMs: 150 }

/** Static gain (dB, <= 0) for a detector level. */
export function gateStaticGain(inDb: number, p: Pick<GateParams, 'thresholdDb' | 'ratio' | 'rangeDb'>): number {
  if (inDb >= p.thresholdDb) return 0
  return Math.max(-p.rangeDb, (inDb - p.thresholdDb) * (p.ratio - 1))
}

export interface GateRender {
  out: Float32Array
  gainDb: Float32Array
  /** Detector level (dB): peak envelope with ~10 ms decay. */
  detDb: Float32Array
}

export function renderGate(input: Float32Array, fs: number, p: GateParams): GateRender {
  const n = input.length
  const aA = timeCoef(p.attackMs, fs)
  const aR = timeCoef(p.releaseMs, fs)
  const envDecay = timeCoef(10, fs)
  const holdN = Math.round((p.holdMs / 1000) * fs)
  const out = new Float32Array(n)
  const gainDb = new Float32Array(n)
  const detDb = new Float32Array(n)
  let env = 0
  let g = -p.rangeDb
  let held = 0
  // Two passes: the first warms up the state over the loop, the second is kept.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const a = Math.abs(input[i])
      env = a > env ? a : envDecay * env
      const inDb = toDb(env)
      let target = gateStaticGain(inDb, p)
      if (target === 0) held = holdN
      else if (held > 0) { held--; target = 0 }
      const c = target > g ? aA : aR // opening = attack, closing = release
      g = c * g + (1 - c) * target
      if (pass === 1) {
        gainDb[i] = g
        detDb[i] = inDb
        out[i] = input[i] * Math.pow(10, g / 20)
      }
    }
  }
  return { out, gainDb, detDb }
}
