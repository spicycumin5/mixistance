import { makeReverbIR } from '../../audio/fx'
import { fmt } from '../common'
import { rms, seeded } from '../helpers'
import type { IrSpec, LabDef } from '../types'

type P = { decaySec: number; preDelayMs: number; damping: number; early: number; send: number }

/** Energy envelope in dB (relative to `ref`, or to its own max), one value per block. */
function envelopeDb(x: Float32Array, block: number, ref?: number): { env: Float32Array; max: number } {
  const n = Math.ceil(x.length / block)
  const e = new Float32Array(n)
  let max = 1e-12
  for (let b = 0; b < n; b++) {
    let s = 0
    for (let i = b * block; i < Math.min(x.length, (b + 1) * block); i++) s += x[i] * x[i]
    e[b] = s / block
    max = Math.max(max, e[b])
  }
  const r = ref ?? max
  for (let b = 0; b < n; b++) e[b] = 10 * Math.log10(e[b] / r + 1e-12)
  return { env: e, max }
}

function onePole(x: Float32Array, fc: number, fs: number, high: boolean) {
  const a = Math.exp((-2 * Math.PI * fc) / fs)
  const y = new Float32Array(x.length)
  let lp = 0
  for (let i = 0; i < x.length; i++) {
    lp = (1 - a) * x[i] + a * lp
    y[i] = high ? x[i] - lp : lp
  }
  return y
}

export const reverbLab: LabDef<P> = {
  id: 'reverb',
  title: 'Reverb',
  tag: 'Space',
  blurb: 'Simulates a room: thousands of echoes that blur into a decaying tail.',
  concept: `In a real room, sound bounces off every surface. First come a few distinct **early reflections** off nearby walls, which tell your ear the room's size and shape. Then thousands of echoes blur into a smooth **tail** that fades away.

A reverb's **impulse response** is that pattern for one click. Every sound you feed it gets "smeared" by it. The plot below shows the impulse response: the gap before it starts (**pre-delay**), the early reflections, and the tail fading by 60 dB over the **decay** time.

Reverb is almost always used **in parallel**, on a send: the dry sound stays as it is, and you add some room underneath it.`,
  sources: ['snare', 'vox', 'drums', 'keys', 'bursts'],
  params: [
    {
      key: 'decaySec', label: 'Decay', min: 0.2, max: 6, default: 1.8, log: true, format: fmt.s, highlight: 'tail',
      what: 'How long the tail takes to fade by 60 dB (RT60). It sets the size of the space.',
      hear: 'Short (0.3-0.8 s) is a room, 1.5-2.5 s is a hall, 4 s+ is a cathedral. Long decays wash over the next note and blur the mix.',
      see: 'The slope of the tail in the impulse plot. The RT60 marker shows where it reaches -60 dB.',
      typical: 'Drums 0.6-1.2 s, vocals 1.2-2.2 s. Shorter in busy, fast songs.',
    },
    {
      key: 'preDelayMs', label: 'Pre-delay', min: 0, max: 200, default: 20, step: 1, format: fmt.ms, highlight: 'predelay',
      what: 'A gap between the dry sound and the start of the reverb.',
      hear: 'Pre-delay keeps the attack of a word or hit clear and up front, with the space blooming just after it. Large pre-delays sound like a bigger room.',
      see: 'The empty region at the start of the impulse plot.',
      typical: '10-40 ms for drums, 40-120 ms for vocals. Tempo-synced (1/64-1/32 note) also works well.',
    },
    {
      key: 'damping', label: 'Damping', min: 0, max: 1, default: 0.5, step: 0.01, format: (v) => fmt.pct(v * 100), highlight: 'damping',
      what: 'How much faster high frequencies die away than lows, like soft furnishings absorbing treble.',
      hear: 'High damping gives a dark, warm tail that stays out of the vocal\'s way. Low damping is bright and splashy, like tiles or a plate.',
      see: 'In the impulse plot, the blue (highs) envelope falls faster than the orange (lows) envelope.',
      typical: '40-70% for most mix reverbs. Darker reverbs sit behind the mix more easily.',
    },
    {
      key: 'early', label: 'Early refl.', min: 0, max: 1, default: 0.3, step: 0.01, format: (v) => fmt.pct(v * 100), highlight: 'early',
      what: 'Level of the first distinct reflections, before the tail blurs together.',
      hear: 'More early reflections give a stronger sense of a specific, physical room and push the sound back. None gives a smooth, abstract wash.',
      see: 'The spikes in the early region of the impulse plot.',
      typical: 'More for realism (drums, acoustic instruments). Less for lush vocal tails.',
    },
    {
      key: 'send', label: 'Send', min: 0, max: 100, default: 0, step: 1, format: fmt.pct, highlight: 'send',
      what: 'How much reverb is added under the dry signal (100% means reverb as loud as the dry).',
      hear: 'More send pushes the sound further away. Too much and it loses focus.',
      see: 'The tail after each hit in the Processed waveform. Delta plays the reverb alone.',
      typical: 'Bring it up until you hear it, then back off a little. Often 10-25%.',
    },
  ],
  async render(src, p, { fs }) {
    const n = src.length
    const ir = makeReverbIR(new OfflineAudioContext(1, 1, fs), p.decaySec, p.preDelayMs, { damping: p.damping, early: p.early, random: seeded(42) })
    const irLen = ir.length
    const ctx = new OfflineAudioContext(1, n + irLen, fs)
    const buf = ctx.createBuffer(1, n, fs)
    buf.copyToChannel(src as Float32Array<ArrayBuffer>, 0)
    const s = ctx.createBufferSource()
    s.buffer = buf
    const conv = ctx.createConvolver()
    conv.buffer = ir
    s.connect(conv).connect(ctx.destination)
    s.start()
    const rendered = (await ctx.startRendering()).getChannelData(0)
    // Fold the tail past the end back onto the start, so the loop is seamless.
    const verb = new Float32Array(n)
    for (let i = 0; i < rendered.length; i++) verb[i % n] += rendered[i]
    const g = rms(src) / Math.max(rms(verb), 1e-9)
    const wet = new Float32Array(n)
    const m = p.send / 100
    for (let i = 0; i < n; i++) wet[i] = src[i] + verb[i] * g * m

    const irData = ir.getChannelData(0)
    const block = Math.round(0.015 * fs)
    const full = envelopeDb(irData, block)
    const lows = envelopeDb(onePole(irData, 400, fs, false), block)
    const highs = envelopeDb(onePole(irData, 4000, fs, true), block)
    const pre = p.preDelayMs / 1000
    const spec: IrSpec = {
      data: irData, fs,
      regions: [
        { t0: 0, t1: pre, label: 'pre-delay', color: '#8b8a93', highlight: 'predelay' },
        { t0: pre, t1: pre + 0.075, label: 'early', color: '#f5a524', highlight: 'early' },
        { t0: pre + 0.075, t1: irLen / fs, label: 'tail', color: '#38bdf8', highlight: 'tail' },
      ],
      envelopes: [
        { data: full.env, blockSec: block / fs, color: '#e8e6e1', label: 'All' },
        { data: lows.env, blockSec: block / fs, color: '#f97316', label: 'Lows <400 Hz', highlight: 'damping' },
        { data: highs.env, blockSec: block / fs, color: '#38bdf8', label: 'Highs >4 kHz', highlight: 'damping' },
      ],
      markers: [{ t: pre + p.decaySec, label: 'RT60', highlight: 'tail' }],
    }
    return { fs, audio: { dry: src, wet }, ir: spec }
  },
  tour: [
    {
      text: 'Play the **snare** with **Send** at 0: completely dry, each hit stops dead. Raise **Send** to **40%**. Now every hit has a tail: that is the room. Switch to **Delta** to hear the reverb on its own.',
      source: 'snare',
      set: { send: 40, decaySec: 1.8, preDelayMs: 20, damping: 0.5, early: 0.3 },
      check: (p) => p.send >= 25,
    },
    {
      text: 'Sweep **Decay** from **0.4 s** to **4 s**. Small room to cathedral. In the impulse plot the tail stretches out, and the RT60 marker moves to where it has dropped 60 dB. With long decays, each tail runs into the next hit.',
      set: { decaySec: 4 },
      check: (p) => p.decaySec >= 3 || p.decaySec <= 0.5,
    },
    {
      text: 'Set Decay back to ~1.5 s and **Pre-delay** to **80 ms**. There is now a clear gap before the reverb starts, so each hit stays crisp and close while the space still blooms behind it.',
      set: { decaySec: 1.5, preDelayMs: 80 },
      check: (p) => p.preDelayMs >= 60,
    },
    {
      text: 'Push **Damping** to **90%**. In the impulse plot the blue (highs) curve now falls much faster than the orange (lows). That gives a darker, warmer room. Try **0%** for a bright, splashy plate.',
      set: { damping: 0.9 },
      check: (p) => p.damping >= 0.8 || p.damping <= 0.1,
    },
    {
      text: 'Set **Early refl.** to **100%**, then **0%**. Early reflections are the discrete spikes at the start of the impulse. They give the impression of a real, physical room. Without them it is a smooth, abstract wash.',
      set: { early: 1 },
      check: (p) => p.early >= 0.9 || p.early <= 0.05,
    },
    {
      text: 'Switch to **Vocal**. A 4 s decay with no pre-delay blurs the words. Find settings that add space but keep the words clear. A typical recipe: 1.5-2 s decay, 60-100 ms pre-delay, 60% damping, 15-20% send.',
      source: 'vox',
      check: (_p, s) => s === 'vox',
    },
  ],
}
