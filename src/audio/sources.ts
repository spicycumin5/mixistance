// Test signals shared by the ear-training drills and the processor labs. All are
// generated in code (royalty-free) and cached per sample rate.

import { DEMO_BPM, generateDemoStems, pinkNoise, type DemoStem } from './demoStems'

/** Labs render offline at a fixed rate. AudioBuffers at this rate play at any context rate. */
export const LAB_FS = 48000

export type DrillSource = 'pink' | 'drums' | 'vox' | 'bass' | 'keys' | 'mix'
export type LabSource = DrillSource | 'bursts' | 'snare' | 'sine' | 'drumsNoise' | 'voxNoise'

export const SOURCE_LABELS: Record<LabSource, string> = {
  pink: 'Pink noise', drums: 'Drums', vox: 'Vocal', bass: 'Bass', keys: 'Keys', mix: 'Full mix',
  bursts: 'Tone bursts', snare: 'Snare', sine: '100 Hz sine', drumsNoise: 'Drums + noise', voxNoise: 'Vocal + room noise',
}

const stemCache = new Map<number, DemoStem[]>()
const dataCache = new Map<string, Float32Array>()

function stems(fs: number) {
  let s = stemCache.get(fs)
  if (!s) stemCache.set(fs, (s = generateDemoStems(fs)))
  return s
}

/** Length of the 2-bar loop the stem-based sources use. */
export const loopLength = (fs: number) => Math.floor((60 / DEMO_BPM) * 8 * fs)

/** One stem, 2 bars, at its generated level (peak 0.7). */
export function stemLoop(id: string, fs: number): Float32Array {
  const s = stems(fs).find((x) => x.id === id)
  return s ? s.data.slice(0, loopLength(fs)) : new Float32Array(loopLength(fs))
}

function normalize(d: Float32Array, peak: number) {
  let m = 0
  for (const x of d) m = Math.max(m, Math.abs(x))
  for (let i = 0; i < d.length; i++) d[i] *= peak / (m || 1)
  return d
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 31 - 1)
}

/** Steps between loud, quiet and silent tones. This is the clearest way to see attack and release. */
function toneBursts(fs: number): Float32Array {
  // [dBFS, or null for silence; seconds]
  const plan: [number | null, number][] = [
    [-6, 0.5], [null, 0.3], [-26, 0.5], [null, 0.3], [-6, 0.12], [null, 0.12], [-6, 0.12], [null, 0.12],
    [-6, 0.4], [-20, 0.5], [null, 0.4], [-12, 0.5], [null, 0.4],
  ]
  const total = Math.round(plan.reduce((s, [, d]) => s + d, 0) * fs)
  const out = new Float32Array(total)
  const fade = Math.round(0.002 * fs)
  let pos = 0
  let level = 0
  for (const [db, dur] of plan) {
    const n = Math.round(dur * fs)
    const target = db === null ? 0 : Math.pow(10, db / 20)
    for (let i = 0; i < n && pos + i < total; i++) {
      const a = level + (target - level) * Math.min(1, i / fade)
      const t = (pos + i) / fs
      out[pos + i] = a * (0.8 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 660 * t))
    }
    level = target
    pos += n
  }
  return out
}

function withNoise(clean: Float32Array, noiseDb: number, seed: number): Float32Array {
  const r = rng(seed)
  const a = Math.pow(10, noiseDb / 20)
  const out = normalize(clean.slice(), 0.5)
  let lp = 0
  for (let i = 0; i < out.length; i++) {
    lp += 0.3 * (r() - lp) // slightly dark hiss
    out[i] += a * lp * 1.8
  }
  return out
}

/** Mono source data, peak-normalised to 0.5 (-6 dBFS). */
export function sourceData(src: LabSource, fs: number): Float32Array {
  const key = `${src}@${fs}`
  const hit = dataCache.get(key)
  if (hit) return hit
  let data: Float32Array
  switch (src) {
    case 'pink':
      data = pinkNoise(fs, 8)
      break
    case 'bursts':
      data = toneBursts(fs)
      break
    case 'sine':
      // Exactly 100 cycles, so the loop is seamless.
      data = Float32Array.from({ length: fs }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 100 * i) / fs))
      break
    case 'snare':
      data = normalize(stemLoop('snare', fs), 0.5)
      break
    case 'drumsNoise':
      data = withNoise(sourceData('drums', fs), -42, 5)
      break
    case 'voxNoise':
      data = withNoise(sourceData('vox', fs), -46, 9)
      break
    default: {
      const all = stems(fs)
      const len = loopLength(fs)
      const pickIds = src === 'drums' ? ['kick', 'snare', 'hats'] : src === 'mix' ? all.map((s) => s.id) : [src]
      data = new Float32Array(len)
      for (const s of all) {
        if (!pickIds.includes(s.id)) continue
        const g = src === 'mix' || src === 'drums' ? Math.pow(10, s.faderDb / 20) : 1
        for (let i = 0; i < len; i++) data[i] += s.data[i] * g
      }
      normalize(data, 0.5)
    }
  }
  dataCache.set(key, data)
  return data
}
