import { clipGainDb, clipTransfer, renderClipper, type ClipMode } from '../../dsp/clipper'
import { averageSpectrumDb } from '../../dsp/fft'
import { AMBER, fmt, MIX_PARAM } from '../common'
import { mixDryWet } from '../helpers'
import type { ChoiceParam, LabDef, SpectrumSpec } from '../types'

type P = { driveDb: number; ceilingDb: number; mode: ClipMode; mix: number }

export const CLIP_MODE: ChoiceParam = {
  kind: 'choice', key: 'mode', label: 'Shape', default: 'hard', highlight: 'shape',
  options: [{ value: 'hard', label: 'Hard clip' }, { value: 'soft', label: 'Soft clip' }, { value: 'asym', label: 'Asymmetric' }],
  what: 'How the clipper bends the waveform as it reaches the ceiling.',
  hear: 'Hard: bright, edgy, adds lots of high odd harmonics. Soft (tanh): rounder and warmer, like tape. Asymmetric: adds even harmonics too, like a tube stage, thick and "musical".',
  see: 'The corner on the transfer curve, and which harmonics show up in the spectrum with the sine source: odd only (3rd, 5th…) for symmetric shapes, plus even (2nd, 4th…) for asymmetric.',
  typical: 'Hard clip for transparent peak shaving on drums. Soft or asymmetric for saturation colour.',
}

export function spectrumSpec(dry: Float32Array, wet: Float32Array, fs: number, sine: boolean, title = 'Spectrum'): SpectrumSpec {
  return {
    title, binHz: fs / 4096, dry: averageSpectrumDb(dry), wet: averageSpectrumDb(wet), smooth: !sine,
    markers: sine
      ? [2, 3, 4, 5].map((h) => ({ freq: 100 * h, label: `${h}${h === 2 ? 'nd' : h === 3 ? 'rd' : 'th'}`, highlight: 'shape|drive' }))
      : [],
  }
}

export const clipperLab: LabDef<P> = {
  id: 'clipper',
  title: 'Clipper & saturation',
  tag: 'Tone',
  blurb: 'Reshapes the waveform itself. This adds harmonics and shaves peaks instantly.',
  concept: `A clipper doesn't turn the volume down over time like a compressor. It changes the **shape of the waveform**, sample by sample. Anything that would go over the **ceiling** gets bent or chopped off.

Changing the shape creates **new frequencies**: **harmonics** at whole-number multiples of the original pitch. That is what we hear as **distortion** or **saturation**. Gentle amounts add warmth and loudness. Heavy amounts get fuzzy and harsh.

Because it acts instantly, a clipper can shave very short peaks (like drum transients) that a limiter would need to "duck" around.`,
  sources: ['sine', 'drums', 'bass', 'vox', 'mix'],
  params: [
    {
      key: 'driveDb', label: 'Drive', min: 0, max: 24, default: 6, step: 0.5, format: fmt.db, highlight: 'drive',
      what: 'Gain into the clipper. More drive pushes more of the waveform into the ceiling.',
      hear: 'More distortion, more harmonics, louder perceived level.',
      see: 'The transfer curve hits the ceiling at lower input levels, and harmonic spikes grow in the spectrum.',
      typical: '1-3 dB of peak shaving is often inaudible on drums. Saturation for colour: to taste.',
    },
    {
      key: 'ceilingDb', label: 'Ceiling', min: -12, max: 0, default: -3, step: 0.5, format: fmt.db, highlight: 'ceiling',
      what: 'The level where clipping begins. The output never goes past it (with hard clip).',
      hear: 'Lower ceiling with the same drive gives more distortion and a quieter output.',
      see: 'The flat top of the transfer curve and the dashed lines on the waveform.',
      typical: 'Just under 0 dBFS for peak control. Lower for creative saturation.',
    },
    CLIP_MODE,
    MIX_PARAM,
  ],
  render(src, p, { fs, source }) {
    const out = renderClipper(src, p)
    const m = p.mix / 100
    const wet = mixDryWet(src, out, m)
    const c = Math.pow(10, p.ceilingDb / 20)
    return {
      fs,
      audio: { dry: src, wet },
      levelLines: [{ db: p.ceilingDb, label: 'Ceiling', highlight: 'ceiling' }],
      lanes: [{ label: 'Instant gain change (per sample)', kind: 'gain', data: clipGainDb(src, out, p.driveDb), highlight: 'drive|ceiling|shape' }],
      curve: {
        title: 'Waveshape (sample in → sample out)', unit: 'lin', lo: -1, hi: 1, xLabel: 'input sample', yLabel: 'output sample',
        lines: [
          { fn: (x) => x, color: '#4a4b57', dash: [4, 4], label: 'unchanged' },
          { fn: (x) => clipTransfer(x, p), color: m < 1 ? '#9a6a1c' : AMBER, width: m < 1 ? 1.5 : 2.5, label: 'Clipper', highlight: 'drive|shape' },
          ...(m < 1 ? [{ fn: (x: number) => (1 - m) * x + m * clipTransfer(x, p), color: AMBER, width: 2.5, label: 'Blended', highlight: 'mix' }] : []),
        ],
        hlines: [{ y: c, label: 'ceiling', highlight: 'ceiling' }, { y: -c, label: '', highlight: 'ceiling' }],
      },
      spectrum: spectrumSpec(src, wet, fs, source === 'sine'),
    }
  },
  tour: [
    {
      text: 'Start with a pure **100 Hz sine**. The view is zoomed in so you can see individual cycles. With **Drive** at 0 dB and the ceiling at 0, nothing is clipped. The spectrum shows a single spike at 100 Hz: one frequency, no harmonics.',
      source: 'sine',
      set: { driveDb: 0, ceilingDb: 0, mode: 'hard', mix: 100 },
    },
    {
      text: 'Set **Ceiling** to **-6 dB** and raise **Drive** to **+12 dB**. The tops of the sine get sliced flat. New spikes appear at **300, 500, 700 Hz**: odd harmonics. These new frequencies weren\'t there before, and that is what distortion is. Hover **Shape** to light up the harmonic markers.',
      set: { ceilingDb: -6, driveDb: 12 },
      check: (p) => p.driveDb >= 9 && p.ceilingDb <= -3,
    },
    {
      text: 'Switch **Shape** to **Soft clip**. The corners round off and the upper harmonics drop faster: a smoother, warmer sound, like tape saturation.',
      set: { mode: 'soft' },
      check: (p) => p.mode === 'soft',
    },
    {
      text: 'Now **Asymmetric**. The top and bottom of the wave bend differently, so **even** harmonics (200, 400 Hz) appear too. Even harmonics are an octave and an octave-plus-fifth up, which is why they sound "musical". This is the tube-amp character.',
      set: { mode: 'asym' },
      check: (p) => p.mode === 'asym',
    },
    {
      text: 'Switch to **Drums**, **Hard clip**, **Drive +4 dB**, **Ceiling -1 dB**. Only the tips of the loudest hits get shaved, each for a fraction of a millisecond. Flip Dry/Processed with **Match loudness** off: louder, and surprisingly hard to hear the clipping. Mastering engineers often clip before the limiter for exactly this reason.',
      set: { mode: 'hard', driveDb: 4, ceilingDb: -1 },
      check: (p, s) => s === 'drums' && p.mode === 'hard',
    },
  ],
}
