import { describe, expect, it } from 'vitest'
import { clipTransfer, renderClipper } from './clipper'
import { CompressorCore, DEFAULT_COMP, parallelCurve, renderCompressor } from './compressorCore'
import { split3 } from './crossover'
import { averageSpectrumDb, harmonicLevels } from './fft'
import { renderGate } from './gateCore'
import { renderLimiter } from './limiterCore'

const fs = 48000
const sine = (secs: number, amp: number, freq: number) =>
  Float32Array.from({ length: Math.round(fs * secs) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / fs))
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
const rms = (x: Float32Array, from = 0) => {
  let s = 0
  for (let i = from; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / (x.length - from))
}
// Deterministic "drum-like" bursts: decaying noise hits at random levels.
function bursts(secs: number) {
  let seed = 3
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 31 - 1)
  const x = new Float32Array(fs * secs)
  for (let h = 0; h < secs * 4; h++) {
    const s0 = Math.floor(h * fs * 0.25), vel = 0.2 + 0.8 * Math.abs(r())
    for (let i = 0; i < fs * 0.2 && s0 + i < x.length; i++) x[s0 + i] += vel * r() * Math.exp(-i / (fs * 0.03))
  }
  return x
}

describe('compressor traces and sidechain', () => {
  it('traced processing matches untraced processing', () => {
    const x = bursts(1)
    const a = new CompressorCore(fs), b = new CompressorCore(fs)
    const xa = x.slice(), xb = x.slice(), tr = new Float32Array(x.length)
    a.process([xa]); b.process([xb], undefined, tr)
    expect(xb).toEqual(xa)
    expect(Math.min(...tr)).toBeLessThan(-3)
  })
  it('the key alone drives gain reduction', () => {
    const quiet = sine(0.5, 0.01, 200) // far below threshold
    const key = new Float32Array(quiet.length).fill(1)
    const { gainDb } = renderCompressor(quiet, fs, { ...DEFAULT_COMP, thresholdDb: -20, ratio: 10 }, key)
    expect(gainDb[gainDb.length - 1]).toBeLessThan(-15)
    const self = renderCompressor(quiet, fs, { ...DEFAULT_COMP, thresholdDb: -20, ratio: 10 })
    expect(self.gainDb[self.gainDb.length - 1]).toBeCloseTo(0, 3)
  })
  it('parallel curve with no wet path is the identity', () => {
    for (const d of [-50, -20, -3]) expect(parallelCurve(d, DEFAULT_COMP, 1, 0)).toBeCloseTo(d, 6)
  })
  it('parallel compression raises quiet signals more than loud ones', () => {
    const p = { ...DEFAULT_COMP, thresholdDb: -30, ratio: 10, makeupDb: 10 }
    const liftQuiet = parallelCurve(-50, p, 1, 1) - -50
    const liftLoud = parallelCurve(-5, p, 1, 1) - -5
    expect(liftQuiet).toBeGreaterThan(liftLoud + 3)
  })
})

describe('limiter', () => {
  for (const look of [0, 1, 5]) {
    it(`never exceeds the ceiling (lookahead ${look} ms)`, () => {
      const { out } = renderLimiter(bursts(2), fs, { inputDb: 12, ceilingDb: -1, releaseMs: 60, lookaheadMs: look })
      expect(20 * Math.log10(peak(out))).toBeLessThanOrEqual(-1 + 1e-4)
    })
  }
  it('leaves signal under the ceiling untouched', () => {
    const x = sine(0.2, 0.1, 440)
    const { out } = renderLimiter(x, fs, { inputDb: 0, ceilingDb: -1, releaseMs: 60, lookaheadMs: 5 })
    expect(peak(out)).toBeCloseTo(0.1, 4)
  })
})

describe('clipper', () => {
  const tone = sine(1, 0.9, 375) // 375 Hz = exactly 32 bins at n=4096, fs=48k
  const binHz = fs / 4096
  it('hard clip never exceeds the ceiling', () => {
    const out = renderClipper(tone, { driveDb: 12, ceilingDb: -6, mode: 'hard' })
    expect(peak(out)).toBeLessThanOrEqual(Math.pow(10, -6 / 20) + 1e-6)
  })
  it('symmetric clipping adds odd harmonics only', () => {
    const h = harmonicLevels(averageSpectrumDb(renderClipper(tone, { driveDb: 12, ceilingDb: -6, mode: 'hard' })), binHz, 375, 4)
    expect(h[2]).toBeGreaterThan(-40) // 3rd
    expect(h[1]).toBeLessThan(-80) // 2nd
  })
  it('asymmetric clipping adds even harmonics', () => {
    const h = harmonicLevels(averageSpectrumDb(renderClipper(tone, { driveDb: 12, ceilingDb: -6, mode: 'asym' })), binHz, 375, 4)
    expect(h[1]).toBeGreaterThan(-40)
  })
  it('transfer is linear well below the ceiling for hard clip', () =>
    expect(clipTransfer(0.01, { driveDb: 0, ceilingDb: -3, mode: 'hard' })).toBeCloseTo(0.01))
})

describe('gate', () => {
  it('attenuates by the range below threshold and passes above it', () => {
    const p = { thresholdDb: -30, ratio: 100, rangeDb: 40, attackMs: 1, holdMs: 0, releaseMs: 20 }
    const q = renderGate(sine(0.5, 0.003, 300), fs, p) // ≈ -50 dBFS
    expect(q.gainDb[q.gainDb.length - 1]).toBeCloseTo(-40, 1)
    const l = renderGate(sine(0.5, 0.5, 300), fs, p)
    expect(l.gainDb[l.gainDb.length - 1]).toBeCloseTo(0, 1)
  })
})

describe('LR4 3-band crossover', () => {
  for (const f of [40, 200, 1000, 3000, 10000]) {
    it(`bands sum flat at ${f} Hz`, () => {
      const x = sine(0.5, 0.5, f)
      const [l, m, h] = split3(x, 200, 3000, fs)
      const sum = x.map((_, i) => l[i] + m[i] + h[i])
      const from = Math.floor(x.length / 2)
      expect(Math.abs(20 * Math.log10(rms(sum, from) / rms(x, from)))).toBeLessThan(0.1)
    })
  }
})
