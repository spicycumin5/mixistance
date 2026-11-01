// Procedurally generated practice multitrack. Royalty-free by construction, and
// deliberately flawed so there is something to fix:
//   kick   — long boomy tail around 60-80 Hz, little click
//   snare  — wildly inconsistent hits (compression practice)
//   hats   — brittle, harsh top end
//   bass   — low-mid build-up around 250 Hz that fights the keys
//   keys   — dense saw pad, muddy 200-500 Hz
//   vox    — synthetic "ah" vocal with a harsh ~3.5 kHz resonance and uneven dynamics

export const DEMO_BPM = 96
const BARS = 8
const CHORDS = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
]
// [midi, startBeat, lengthBeats, velocity] per bar, A minor pentatonic-ish melody
const MELODY: [number, number, number, number][][] = [
  [[76, 0, 2, 0.9], [74, 2, 1, 0.5], [72, 3, 1, 0.6]],
  [[72, 0, 1.5, 0.4], [69, 1.5, 0.5, 0.3], [69, 2, 2, 0.8]],
  [[67, 0, 1, 0.5], [69, 1, 1, 0.6], [72, 2, 2, 1.0]],
  [[74, 0, 1.5, 0.35], [72, 1.5, 0.5, 0.3], [71, 2, 2, 0.7]],
  [[76, 0, 1, 1.0], [79, 1, 1, 0.95], [76, 2, 2, 0.6]],
  [[72, 0, 1, 0.3], [74, 1, 1, 0.45], [72, 2, 2, 0.9]],
  [[67, 0, 1.5, 0.7], [69, 1.5, 0.5, 0.25], [72, 2, 2, 0.5]],
  [[71, 0, 2, 0.4], [69, 2, 2, 1.0]],
]

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

// Deterministic noise so the demo sounds identical every load.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 31 - 1
  }
}

function polyBlep(t: number, dt: number) {
  if (t < dt) { t /= dt; return t + t - t * t - 1 }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1 }
  return 0
}

class Saw {
  phase = Math.random()
  next(freq: number, fs: number) {
    const dt = freq / fs
    const v = 2 * this.phase - 1 - polyBlep(this.phase, dt)
    this.phase += dt
    if (this.phase >= 1) this.phase -= 1
    return v
  }
}

/** Chamberlin state-variable filter; returns [low, band, high]. */
class Svf {
  low = 0; band = 0
  tick(x: number, fc: number, q: number, fs: number): [number, number, number] {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, fs / 6)) / fs)
    this.low += f * this.band
    const high = x - this.low - this.band / q
    this.band += f * high
    return [this.low, this.band, high]
  }
}

function normalize(d: Float32Array, peak = 0.7) {
  let m = 0
  for (const x of d) m = Math.max(m, Math.abs(x))
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m
}

export interface DemoStem {
  id: string
  name: string
  color: string
  pan: number
  faderDb: number
  data: Float32Array
}

export function generateDemoStems(fs: number): DemoStem[] {
  const beat = 60 / DEMO_BPM
  const total = Math.ceil(BARS * 4 * beat * fs)
  const at = (b: number) => Math.floor(b * beat * fs)
  const mk = () => new Float32Array(total)
  const rand = rng(7)

  // Kick
  const kick = mk()
  for (let bar = 0; bar < BARS; bar++) {
    const hits = bar % 2 ? [0, 2, 2.5] : [0, 2]
    for (const h of hits) {
      const s0 = at(bar * 4 + h)
      let ph = 0
      for (let i = 0; i < fs * 0.7 && s0 + i < total; i++) {
        const t = i / fs
        const f = 48 + 110 * Math.exp(-t * 28)
        ph += (2 * Math.PI * f) / fs
        kick[s0 + i] += Math.sin(ph) * Math.exp(-t * 4.2) + (i < 60 ? rand() * 0.15 * (1 - i / 60) : 0)
      }
    }
  }

  // Snare with inconsistent velocity and ghost notes
  const snare = mk()
  const snSvf = new Svf()
  for (let bar = 0; bar < BARS; bar++) {
    const hits: [number, number][] = [[1, 0.55 + 0.45 * Math.abs(rand())], [3, 0.35 + 0.65 * Math.abs(rand())]]
    if (bar % 2) hits.push([3.75, 0.15])
    for (const [h, vel] of hits) {
      const s0 = at(bar * 4 + h)
      for (let i = 0; i < fs * 0.35 && s0 + i < total; i++) {
        const t = i / fs
        const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30)
        const [, bp] = snSvf.tick(rand(), 4000, 0.8, fs)
        snare[s0 + i] += vel * (0.6 * tone + 1.2 * bp * Math.exp(-t * 14))
      }
    }
  }

  // Hats: harsh, brittle
  const hats = mk()
  let prev = 0
  for (let e = 0; e < BARS * 8; e++) {
    const s0 = at(e / 2)
    const vel = e % 2 ? 0.45 : 0.9
    for (let i = 0; i < fs * 0.06 && s0 + i < total; i++) {
      const n = rand()
      hats[s0 + i] += vel * (n - prev) * Math.exp(-(i / fs) * 70)
      prev = n
    }
  }

  // Bass: 8ths on chord root, with a 250 Hz bump
  const bass = mk()
  const bSaw = new Saw()
  const bSvf = new Svf()
  const bBump = new Svf()
  let bLp = 0
  for (let i = 0; i < total; i++) {
    const beatPos = i / fs / beat
    const chord = CHORDS[Math.floor(beatPos / 4) % 4]
    const local = beatPos % 0.5
    const env = Math.min(1, local * 80) * Math.exp(-local * 3) * (local < 0.45 ? 1 : (0.5 - local) * 20)
    const x = bSaw.next(mtof(chord.root - 12 + (Math.floor(beatPos * 2) % 4 === 3 ? 12 : 0)), fs)
    bLp += 0.06 * (x - bLp)
    const [, bp] = bBump.tick(bLp, 250, 2.5, fs)
    const [lp] = bSvf.tick(bLp + 1.4 * bp, 900, 0.7, fs)
    bass[i] = lp * env
  }

  // Keys: detuned saw pad, muddy
  const keys = mk()
  const kSaws = CHORDS.flatMap(() => [0, 1, 2].map(() => [new Saw(), new Saw()]))
  const kSvf = new Svf()
  for (let i = 0; i < total; i++) {
    const beatPos = i / fs / beat
    const ci = Math.floor(beatPos / 4) % 4
    const local = beatPos % 4
    const env = Math.min(1, local * 4) * (local > 3.8 ? (4 - local) * 5 : 1)
    let v = 0
    CHORDS[ci].tones.forEach((m, k) => {
      const [a, b] = kSaws[ci * 3 + k]
      v += a.next(mtof(m - 12) * 1.003, fs) + b.next(mtof(m) * 0.997, fs)
    })
    const [lp] = kSvf.tick(v, 2200, 0.9, fs)
    keys[i] = lp * env
  }

  // Vox: additive "ah" with vibrato, formants + harsh 3.5 kHz resonance
  const vox = mk()
  const formant = (f: number) =>
    Math.exp(-(((f - 750) / 160) ** 2)) +
    0.6 * Math.exp(-(((f - 1150) / 180) ** 2)) +
    0.35 * Math.exp(-(((f - 2700) / 250) ** 2)) +
    0.55 * Math.exp(-(((f - 3500) / 200) ** 2)) + // the harsh bit
    0.03
  let vPh = 0
  for (let bar = 0; bar < BARS; bar++) {
    for (const [m, start, len, vel] of MELODY[bar]) {
      const s0 = at(bar * 4 + start)
      const n = Math.floor(len * beat * fs)
      const f0 = mtof(m)
      const harmonics = Math.floor(6000 / f0)
      const amps = Array.from({ length: harmonics }, (_, h) => formant(f0 * (h + 1)) / Math.sqrt(h + 1))
      for (let i = 0; i < n && s0 + i < total; i++) {
        const t = i / fs
        const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t * 2)
        vPh += (2 * Math.PI * f0 * vib) / fs
        let v = 0
        for (let h = 0; h < harmonics; h++) v += amps[h] * Math.sin((h + 1) * vPh)
        const env = Math.min(1, t * 25) * Math.min(1, (n - i) / (fs * 0.05))
        vox[s0 + i] += vel * vel * env * (v + 0.04 * rand())
      }
    }
  }

  for (const d of [kick, snare, hats, bass, keys, vox]) normalize(d)

  return [
    { id: 'kick', name: 'Kick', color: '#f97316', pan: 0, faderDb: -6, data: kick },
    { id: 'snare', name: 'Snare', color: '#eab308', pan: 0, faderDb: -8, data: snare },
    { id: 'hats', name: 'Hats', color: '#84cc16', pan: 0.35, faderDb: -12, data: hats },
    { id: 'bass', name: 'Bass', color: '#06b6d4', pan: 0, faderDb: -7, data: bass },
    { id: 'keys', name: 'Keys', color: '#8b5cf6', pan: -0.2, faderDb: -10, data: keys },
    { id: 'vox', name: 'Vox', color: '#ec4899', pan: 0, faderDb: -6, data: vox },
  ]
}

/** Pink noise via Paul Kellet's refined filter. */
export function pinkNoise(fs: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(fs * seconds))
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  const r = rng(11)
  for (let i = 0; i < out.length; i++) {
    const w = r()
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  normalize(out, 0.5)
  return out
}
