import type { Zone } from './types'

export const lin = (db: number) => Math.pow(10, db / 20)
export const db = (x: number) => 20 * Math.log10(Math.max(Math.abs(x), 1e-9))

/** Linear crossfade between dry and wet (mix 0-1). Returns wet itself at mix 1. */
export function mixDryWet(dry: Float32Array, wet: Float32Array, mix: number): Float32Array {
  if (mix >= 1) return wet
  const out = new Float32Array(dry.length)
  for (let i = 0; i < out.length; i++) out[i] = dry[i] * (1 - mix) + wet[i] * mix
  return out
}

export function rms(x: Float32Array) {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / Math.max(1, x.length))
}

export function peak(x: Float32Array) {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]))
  return m
}

/**
 * Find where a gain trace is moving: 'attack' while the processor clamps down and
 * 'release' while it recovers. `attackWhen` says which direction is attack: 'down'
 * (compressor, more reduction) or 'up' (gate, opening).
 */
export function envelopeZones(gainDb: Float32Array, fs: number, attackWhen: 'down' | 'up' = 'down'): Zone[] {
  const block = Math.max(1, Math.round(fs / 1000)) // 1 ms
  const thr = 0.004 // dB per ms
  const zones: Zone[] = []
  let kind: string | null = null
  let start = 0
  const close = (end: number) => {
    if (kind && end - start >= 2 * block) zones.push({ t0: start / fs, t1: end / fs, highlight: kind })
  }
  for (let i = 0; i + block < gainDb.length; i += block) {
    const d = gainDb[i + block] - gainDb[i]
    const k = Math.abs(d) < thr ? null : (d < 0) === (attackWhen === 'down') ? 'attack' : 'release'
    if (k !== kind) {
      close(i)
      kind = k
      start = i
    }
    if (zones.length > 400) break
  }
  close(gainDb.length - 1)
  return zones
}

/** Seeded [0, 1) random, for repeatable reverb tails. */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
