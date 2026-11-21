// Parameter definitions and curve builders shared between labs.

import { parallelCurve, staticCurve, type CompressorParams } from '../dsp/compressorCore'
import type { CurveSpec, NumParam } from './types'

export const fmt = {
  db: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
  ms: (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`,
  ratio: (v: number) => (v >= 19.5 ? '∞:1' : `${v.toFixed(1)}:1`),
  pct: (v: number) => `${Math.round(v)}%`,
  hz: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`) + ' Hz',
  s: (v: number) => `${v.toFixed(1)} s`,
}

export const AMBER = '#f5a524'
export const DIM = '#8b8a93'
export const BAND_COLORS = ['#f97316', '#4ade80', '#38bdf8']

type CompKey = 'thresholdDb' | 'ratio' | 'kneeDb' | 'attackMs' | 'releaseMs' | 'makeupDb'

export const COMP_PARAMS: Record<CompKey, NumParam> = {
  thresholdDb: {
    key: 'thresholdDb', label: 'Threshold', min: -60, max: 0, default: -20, step: 0.5, format: fmt.db, highlight: 'threshold',
    what: 'The level where the compressor starts working. Anything quieter passes through untouched.',
    hear: 'Lower threshold means more of the signal gets turned down, not just the loudest peaks.',
    see: 'The dashed line on the waveform and the bend in the transfer curve. Only the parts of the waveform above it get smaller.',
    typical: 'Set it so the loudest moments go 3-6 dB over. Watch the gain-reduction lane rather than the number.',
  },
  ratio: {
    key: 'ratio', label: 'Ratio', min: 1, max: 20, default: 4, log: true, format: fmt.ratio, highlight: 'ratio',
    what: 'How hard signal above the threshold gets squeezed. At 4:1, going 8 dB over the threshold comes out only 2 dB over.',
    hear: 'Low ratios (1.5-3) sound gentle and natural. High ratios (8+) flatten everything and start to sound like limiting.',
    see: 'The slope of the transfer curve above the threshold. 1:1 is the diagonal, ∞:1 is flat.',
    typical: 'Vocals 2-4:1, bass 4-6:1, drums 4-8:1, mix bus 1.5-2:1.',
  },
  kneeDb: {
    key: 'kneeDb', label: 'Knee', min: 0, max: 18, default: 6, step: 0.5, format: fmt.db, highlight: 'knee',
    what: 'How gradually compression kicks in around the threshold. Hard knee (0) switches on instantly. Soft knee eases in over a range of levels.',
    hear: 'A soft knee is less noticeable. A hard knee is more obvious and aggressive.',
    see: 'The shaded zone on the transfer curve, where the line gradually bends from 1:1 to the full ratio.',
    typical: '3-10 dB for transparent levelling, 0-2 dB for punchy drums or obvious effect.',
  },
  attackMs: {
    key: 'attackMs', label: 'Attack', min: 0.1, max: 150, default: 10, log: true, format: fmt.ms, highlight: 'attack',
    what: 'How fast gain reduction arrives once the signal goes over the threshold.',
    hear: 'Fast attack (<3 ms) catches the transient and softens the hit. Slow attack (20-50 ms) lets the initial "click" through, which can sound punchier.',
    see: 'The shaded "attack" spans: the moments where the gain-reduction lane is dropping. Zoom in on the start of a loud burst to see the overshoot slow attack leaves.',
    typical: 'Drums 10-30 ms for punch, vocals 3-10 ms, bass 1-5 ms for control.',
  },
  releaseMs: {
    key: 'releaseMs', label: 'Release', min: 10, max: 2000, default: 120, log: true, format: fmt.ms, highlight: 'release',
    what: 'How fast gain reduction goes away once the signal drops back under the threshold.',
    hear: 'Too fast pumps or distorts low notes. Too slow keeps the quiet part after a loud hit turned down ("ducking"). Matched to the tempo, it breathes with the groove.',
    see: 'The shaded "release" spans: where the gain-reduction lane climbs back to 0.',
    typical: '50-150 ms for drums, 100-300 ms for vocals, longer for buses. Try timing it so the gain-reduction lane returns to 0 just before the next hit.',
  },
  makeupDb: {
    key: 'makeupDb', label: 'Makeup', min: 0, max: 24, default: 0, step: 0.5, format: fmt.db, highlight: 'makeup',
    what: 'Plain gain added after compression, to win back the level the compressor took away.',
    hear: 'Louder overall. Because loud parts were reduced, makeup brings the quiet parts up relative to where they were.',
    see: 'The whole transfer curve shifts up. Compare the Processed waveform with Dry.',
    typical: 'Roughly the average gain reduction. Turn on "Match loudness" to judge the tone without the volume boost fooling you.',
  },
}

export const MIX_PARAM: NumParam = {
  key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, step: 1, format: fmt.pct, highlight: 'mix',
  what: 'Blend between the unprocessed (dry) and processed (wet) signal. This is parallel processing built into one knob.',
  hear: 'Below 100% the original transients and dynamics come back, mixed with the processed character.',
  see: 'On the transfer curve, the blended line moves from the processed curve back toward the diagonal, rising most at low levels.',
  typical: '30-60% for "parallel" or "New York" compression on drums and vocals.',
}

export function compParams(p: Record<string, number | string>): CompressorParams {
  return {
    thresholdDb: Number(p.thresholdDb), ratio: Number(p.ratio), kneeDb: Number(p.kneeDb ?? 6),
    attackMs: Number(p.attackMs), releaseMs: Number(p.releaseMs), makeupDb: Number(p.makeupDb ?? 0),
  }
}

/** Transfer curve for a compressor, with an optional dry/wet blend (dry and wet are linear weights). */
export function compressorCurve(cp: CompressorParams, blend?: { dry: number; wet: number; label: string; highlight: string }): CurveSpec {
  const T = cp.thresholdDb
  const W = cp.kneeDb
  const comp = (x: number) => staticCurve(x, cp) + cp.makeupDb
  const lines: CurveSpec['lines'] = [
    { fn: (x) => x, color: '#4a4b57', dash: [4, 4], label: '1:1 (no change)' },
    { fn: comp, color: blend ? '#9a6a1c' : AMBER, width: blend ? 1.5 : 2.5, label: 'Compressor', highlight: 'makeup', dash: blend ? [5, 3] : undefined },
    { fn: comp, color: '#fde68a', width: 4, onlyActive: true, highlight: 'ratio', from: T + W / 2 },
  ]
  if (blend) lines.push({ fn: (x) => parallelCurve(x, cp, blend.dry, blend.wet), color: AMBER, width: 2.5, label: blend.label, highlight: blend.highlight })
  return {
    title: 'Transfer curve', unit: 'dB', lo: -60, hi: 0, xLabel: 'input dB', yLabel: 'output dB', lines,
    vlines: [{ x: T, label: 'T', highlight: 'threshold' }],
    zones: W > 0 ? [{ x0: T - W / 2, x1: T + W / 2, highlight: 'knee' }] : [],
  }
}
