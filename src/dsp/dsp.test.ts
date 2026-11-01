import { describe, expect, it } from 'vitest'
import { CompressorCore, staticCurve, timeCoef } from './compressorCore'
import { LoudnessMeter } from './loudness'
import { bandMagnitudeDb, curveDistanceDb, DEFAULT_EQ, EqBand } from './biquad'

describe('compressor static curve', () => {
  const p = { thresholdDb: -20, ratio: 4, kneeDb: 0 }
  it('passes signal below threshold', () => expect(staticCurve(-30, p)).toBeCloseTo(-30))
  it('applies ratio above threshold', () => expect(staticCurve(-8, p)).toBeCloseTo(-17))
  it('soft knee is continuous at its edges', () => {
    const k = { ...p, kneeDb: 10 }
    expect(staticCurve(-25, k)).toBeCloseTo(-25)
    expect(staticCurve(-15, k)).toBeCloseTo(-20 + 5 / 4)
    expect(staticCurve(-20, k)).toBeLessThan(-20)
  })
})

describe('compressor dynamics', () => {
  const fs = 48000
  it('reaches ~63% of target GR after attack time', () => {
    const c = new CompressorCore(fs)
    c.set({ thresholdDb: -20, ratio: 1000, kneeDb: 0, attackMs: 10, releaseMs: 100 })
    const buf = new Float32Array(fs * 0.01).fill(1) // 0 dBFS, target GR ≈ 20 dB
    c.process([buf])
    const grDb = -20 * Math.log10(buf[buf.length - 1])
    expect(grDb).toBeGreaterThan(20 * 0.6)
    expect(grDb).toBeLessThan(20 * 0.66)
  })
  it('time coefficient is zero for instant', () => expect(timeCoef(0, fs)).toBe(0))
})

describe('loudness meter (EBU Tech 3341)', () => {
  const sine = (fs: number, secs: number, dbfs: number, freq = 1000) => {
    const a = Math.pow(10, dbfs / 20)
    return Float32Array.from({ length: fs * secs }, (_, i) => a * Math.sin((2 * Math.PI * freq * i) / fs))
  }
  for (const fs of [44100, 48000]) {
    it(`stereo 1 kHz sine at -23 dBFS reads -23 LUFS @ ${fs}`, () => {
      const m = new LoudnessMeter(fs, 2)
      const s = sine(fs, 5, -23)
      m.process([s, s])
      const r = m.read()
      expect(r.integrated).toBeCloseTo(-23, 1)
      expect(r.momentary).toBeCloseTo(-23, 1)
      expect(r.shortTerm).toBeCloseTo(-23, 1)
    })
  }
  it('true peak of a full-scale sine is ~0 dBTP', () => {
    const m = new LoudnessMeter(48000, 1)
    m.process([sine(48000, 1, 0, 997)])
    expect(m.read().truePeakDb).toBeCloseTo(0, 0)
  })
})

describe('eq math', () => {
  it('peaking band hits its gain at center', () => {
    const b: EqBand = { type: 'peaking', freq: 1000, gainDb: 6, q: 1, enabled: true }
    expect(bandMagnitudeDb(b, 1000)).toBeCloseTo(6, 3)
  })
  it('distance is zero for identical curves and grows with difference', () => {
    expect(curveDistanceDb(DEFAULT_EQ, DEFAULT_EQ)).toBe(0)
    const moved = DEFAULT_EQ.map((b, i) => (i === 2 ? { ...b, gainDb: 6 } : b))
    expect(curveDistanceDb(DEFAULT_EQ, moved)).toBeGreaterThan(1)
  })
})
