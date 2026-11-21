import { lr4MagDb } from '../../dsp/crossover'
import { averageSpectrumDb } from '../../dsp/fft'
import { renderMultiband } from '../../dsp/multiband'
import { BAND_COLORS, COMP_PARAMS, fmt } from '../common'
import type { LabDef, NumParam } from '../types'

type P = {
  lowXover: number; highXover: number; lowThresh: number; midThresh: number; highThresh: number
  ratio: number; attackMs: number; releaseMs: number; solo: string
}

const bandThresh = (key: string, label: string, band: number, name: string, typical: string): NumParam => ({
  ...COMP_PARAMS.thresholdDb, key, label, default: 0, highlight: `band${band}`,
  what: `Threshold for the ${name} band only. The other bands are unaffected.`,
  hear: `Lowering it compresses just the ${name}s, without pulling down the rest of the mix.`,
  see: `Only the ${name} band's gain-reduction lane moves, and its shaded curve on the spectrum dips by the average reduction.`,
  typical,
})

export const multibandLab: LabDef<P> = {
  id: 'multiband',
  title: 'Multiband compression',
  tag: 'Dynamics',
  blurb: 'Split into frequency bands and compress each one separately.',
  concept: `A normal compressor reacts to the whole signal. When a loud kick drum hits, **everything** gets turned down, vocals and cymbals included.

A **multiband compressor** first splits the sound into frequency **bands** with **crossover** filters (here: low, mid, high). Each band gets its own compressor, and then the bands are added back together. With no compression, the bands sum back to exactly the original.

This lets you control a boomy low end without dulling the vocal, or tame harsh highs only when they flare up. It is a dynamic EQ: tone that changes with level.`,
  sources: ['mix', 'drums', 'bass', 'vox'],
  params: [
    bandThresh('lowThresh', 'Low thr', 1, 'low', 'Lower it until the low lane shows 2-4 dB on kick and bass notes.'),
    bandThresh('midThresh', 'Mid thr', 2, 'mid', 'Gentle: 1-3 dB to steady vocals and keys.'),
    bandThresh('highThresh', 'High thr', 3, 'high', 'Catch harsh moments (cymbals, sibilance) with 2-4 dB.'),
    {
      key: 'lowXover', label: 'Low x-over', min: 40, max: 1000, default: 200, log: true, format: fmt.hz, highlight: 'xover1',
      what: 'The frequency that divides the low band from the mid band.',
      hear: 'Higher puts more of the body and low-mids into the low band, so it gets compressed along with the kick and bass.',
      see: 'The first vertical marker on the spectrum and where the orange and green band curves cross (each is -6 dB there).',
      typical: '100-250 Hz to isolate kick and bass.',
    },
    {
      key: 'highXover', label: 'High x-over', min: 1000, max: 12000, default: 3000, log: true, format: fmt.hz, highlight: 'xover2',
      what: 'The frequency that divides the mid band from the high band.',
      hear: 'Lower moves vocal presence into the high band. Higher keeps only air and cymbals there.',
      see: 'The second vertical marker on the spectrum.',
      typical: '2.5-6 kHz.',
    },
    { ...COMP_PARAMS.ratio, highlight: 'gr' },
    { ...COMP_PARAMS.attackMs, highlight: 'gr' },
    { ...COMP_PARAMS.releaseMs, highlight: 'gr' },
    {
      key: 'solo', kind: 'choice', label: 'Listen', default: '0', highlight: 'solo',
      options: [{ value: '0', label: 'All bands' }, { value: '1', label: 'Low' }, { value: '2', label: 'Mid' }, { value: '3', label: 'High' }],
      what: 'Solo one band to hear what the crossover sends into it. Dry plays the same band uncompressed.',
      hear: 'You hear what each band\'s compressor is actually reacting to.',
      see: 'The waveform shows only the soloed band.',
      typical: 'Solo while you set crossovers, then go back to All.',
    },
  ],
  render(src, p, { fs }) {
    const solo = Number(p.solo)
    const r = renderMultiband(src, fs, { ...p, solo })
    const dry = solo ? r.bands[solo - 1] : src
    const mean = r.gainDb.map((g) => {
      let s = 0
      for (let i = 0; i < g.length; i++) s += g[i]
      return s / g.length
    })
    const f1 = p.lowXover
    const f2 = Math.max(p.highXover, p.lowXover * 1.5)
    const names = ['Low', 'Mid', 'High']
    return {
      fs,
      audio: { dry, wet: r.out },
      lanes: r.gainDb.map((g, k) => ({
        label: `${names[k]} band gain reduction`, kind: 'gain' as const, data: g, color: BAND_COLORS[k], highlight: `band${k + 1}|gr`, rangeDb: 18,
      })),
      spectrum: {
        title: 'Spectrum and bands (shaded curves show each band dipping by its average gain reduction)',
        binHz: fs / 4096, dry: averageSpectrumDb(dry), wet: averageSpectrumDb(r.out), smooth: true,
        markers: [{ freq: f1, label: fmt.hz(f1), highlight: 'xover1' }, { freq: f2, label: fmt.hz(f2), highlight: 'xover2' }],
        overlays: [
          { fn: (f) => lr4MagDb('lowpass', f1, f) + mean[0], color: BAND_COLORS[0], label: 'Low', highlight: 'band1|xover1' },
          { fn: (f) => lr4MagDb('highpass', f1, f) + lr4MagDb('lowpass', f2, f) + mean[1], color: BAND_COLORS[1], label: 'Mid', highlight: 'band2|xover1|xover2' },
          { fn: (f) => lr4MagDb('highpass', f2, f) + mean[2], color: BAND_COLORS[2], label: 'High', highlight: 'band3|xover2' },
        ],
      },
    }
  },
  tour: [
    {
      text: 'Play the **Full mix** with every threshold at 0 dB. Nothing is compressed, and the three bands add back up to exactly the original. Try **Listen → Low / Mid / High** to hear what the crossovers send to each band, then return to **All bands**.',
      source: 'mix',
      set: { lowThresh: 0, midThresh: 0, highThresh: 0, solo: '0', ratio: 4, attackMs: 10, releaseMs: 120 },
    },
    {
      text: 'Lower **Low thr** to about **-30 dB**. Only the orange lane moves: kick and bass are held in check while the vocal and hats are untouched. A normal compressor would have pulled the whole mix down on every kick.',
      set: { lowThresh: -30 },
      check: (p) => p.lowThresh <= -20,
    },
    {
      text: 'Lower **High thr** to around **-36 dB**. The harsh hats get reined in. On the spectrum the blue band curve sinks and the top end of the amber spectrum drops. That is a dynamic EQ cut.',
      set: { highThresh: -36 },
      check: (p) => p.highThresh <= -24,
    },
    {
      text: 'Raise **Low x-over** to **500 Hz**. Now the muddy low-mids of the keys and bass fall into the low band too, and they get compressed along with the kick. The crossovers decide which instruments each compressor reacts to.',
      set: { lowXover: 500 },
      check: (p) => p.lowXover >= 400,
    },
  ],
}
