// Pure question generation and scoring for ear-training drills.

import { curveDistanceDb, DEFAULT_EQ, type EqBand } from '../../dsp/biquad'
import type { CompressorParams } from '../../dsp/compressorCore'

export type Rand = () => number // 0..1

const pick = <T,>(arr: readonly T[], r: Rand) => arr[Math.floor(r() * arr.length)]
const logBetween = (lo: number, hi: number, r: Rand) => lo * Math.pow(hi / lo, r())

// ---------- Frequency ID ----------

export const OCTAVE_BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const THIRD_BANDS = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000]

export interface FreqIdLevel {
  id: string
  label: string
  description: string
  bands: number[]
  gainDb: number
  q: number
  /** Number of answer options shown (a window around the answer); 0 = all. */
  window: number
}

export const FREQ_ID_LEVELS: FreqIdLevel[] = [
  { id: 'oct-boost', label: 'Octaves: boosts', description: '+12 dB, 9 octave bands. Start here.', bands: OCTAVE_BANDS, gainDb: 12, q: 1.4, window: 0 },
  { id: 'oct-cut', label: 'Octaves: cuts', description: '-12 dB cuts are much harder to hear than boosts.', bands: OCTAVE_BANDS, gainDb: -12, q: 1.4, window: 0 },
  { id: 'oct-subtle', label: 'Octaves: subtle', description: '+6 dB, the size of a real mix move.', bands: OCTAVE_BANDS, gainDb: 6, q: 1.4, window: 0 },
  { id: 'third-boost', label: '1/3 octaves', description: '+9 dB, choose from 7 neighbouring bands.', bands: THIRD_BANDS, gainDb: 9, q: 4.3, window: 7 },
]

export interface FreqIdQuestion {
  answer: number // index into level.bands
  options: number[] // indices into level.bands
  band: EqBand
}

export function makeFreqIdQuestion(level: FreqIdLevel, r: Rand = Math.random): FreqIdQuestion {
  const n = level.bands.length
  const answer = Math.floor(r() * n)
  let options = level.bands.map((_, i) => i)
  if (level.window && level.window < n) {
    const startMax = n - level.window
    const lo = Math.max(0, answer - level.window + 1)
    const hi = Math.min(startMax, answer)
    const start = lo + Math.floor(r() * (hi - lo + 1))
    options = options.slice(start, start + level.window)
  }
  return {
    answer,
    options,
    band: { type: 'peaking', freq: level.bands[answer], gainDb: level.gainDb, q: level.q, enabled: true },
  }
}

/** 1 for exact, partial credit for neighbours (in octaves). */
export function scoreFreqId(level: FreqIdLevel, answer: number, guess: number): number {
  if (answer === guess) return 1
  const octaves = Math.abs(Math.log2(level.bands[answer] / level.bands[guess]))
  if (octaves <= 0.34) return 0.5
  if (octaves <= 1.01) return 0.25
  return 0
}

// ---------- Compression detection ----------

export type CompQuestionKind = 'which' | 'attack' | 'ratio'

export interface CompQuestion {
  kind: CompQuestionKind
  prompt: string
  explain: string
  /** Settings for path A and B; null = uncompressed. */
  a: CompressorParams | null
  b: CompressorParams | null
  answer: 0 | 1
}

const BASE: CompressorParams = { thresholdDb: -26, ratio: 6, attackMs: 5, releaseMs: 80, kneeDb: 3, makeupDb: 0 }

export function makeCompQuestion(kinds: CompQuestionKind[], r: Rand = Math.random): CompQuestion {
  const kind = pick(kinds, r)
  const answer: 0 | 1 = r() < 0.5 ? 0 : 1
  const order = <T,>(target: T, other: T): [T, T] => (answer === 0 ? [target, other] : [other, target])
  if (kind === 'which') {
    const [a, b] = order<CompressorParams | null>({ ...BASE }, null)
    return {
      kind, a, b, answer,
      prompt: 'Both are level-matched. Which one is compressed?',
      explain: 'Listen for the space between hits: compression brings up the tails and room and flattens the difference between loud and soft hits. Loudness is not a clue here, because both versions are matched.',
    }
  }
  if (kind === 'attack') {
    const [a, b] = order<CompressorParams | null>({ ...BASE, attackMs: 40 }, { ...BASE, attackMs: 0.3 })
    return {
      kind, a, b, answer,
      prompt: 'Both are compressed the same amount. Which has the SLOWER attack?',
      explain: 'A slow attack lets the transient "crack" through before gain reduction kicks in, so it sounds punchier and more forward. A very fast attack shaves the front off each hit and sounds softer and duller.',
    }
  }
  const [a, b] = order<CompressorParams | null>({ ...BASE, ratio: 10, thresholdDb: -30 }, { ...BASE, ratio: 2, thresholdDb: -30 })
  return {
    kind, a, b, answer,
    prompt: 'Same threshold, different ratio. Which is the HIGHER ratio (heavier)?',
    explain: 'Higher ratios flatten the peaks more, so the sound gets denser and loses dynamic contrast. At 2:1 the hits still breathe; at 10:1 they start to sound squashed and the sustain jumps up.',
  }
}

// ---------- EQ match ----------

export function makeEqTarget(difficulty: 1 | 2 | 3, r: Rand = Math.random): EqBand[] {
  const eq = DEFAULT_EQ.map((b) => ({ ...b }))
  const sign = () => (r() < 0.5 ? -1 : 1)
  const moves: (() => void)[] = [
    () => Object.assign(eq[2], { freq: Math.round(logBetween(150, 900, r)), gainDb: sign() * (4 + Math.round(r() * 5)), q: difficulty === 1 ? 1 : +(0.8 + r() * 2.2).toFixed(2) }),
    () => Object.assign(eq[3], { freq: Math.round(logBetween(1200, 6000, r)), gainDb: sign() * (4 + Math.round(r() * 5)), q: difficulty === 1 ? 1 : +(0.8 + r() * 2.2).toFixed(2) }),
    () => Object.assign(eq[1], { freq: Math.round(logBetween(80, 250, r)), gainDb: sign() * (3 + Math.round(r() * 4)) }),
    () => Object.assign(eq[4], { freq: Math.round(logBetween(5000, 12000, r)), gainDb: sign() * (3 + Math.round(r() * 4)) }),
  ]
  const count = difficulty
  const chosen = new Set<number>()
  while (chosen.size < count) chosen.add(Math.floor(r() * moves.length))
  chosen.forEach((i) => moves[i]())
  return eq
}

/** Score 0..1 from the RMS curve difference; within ~1 dB counts as a full match. */
export function scoreEqMatch(user: EqBand[], target: EqBand[]) {
  const dist = curveDistanceDb(user, target)
  const score = dist <= 1 ? 1 : Math.max(0, 1 - (dist - 1) / 4)
  return { dist, score }
}

// ---------- Level difference ----------

export const LEVEL_STEPS = [3, 2, 1, 0.5]

export function makeLevelQuestion(stepDb: number, r: Rand = Math.random) {
  const answer: 0 | 1 = r() < 0.5 ? 0 : 1
  return { answer, gainsDb: answer === 0 ? [stepDb, 0] : [0, stepDb] }
}
