import { clipGainDb, renderClipper } from '../../dsp/clipper'
import { renderLimiter } from '../../dsp/limiterCore'
import { fmt } from '../common'
import { envelopeZones } from '../helpers'
import type { LabDef } from '../types'
import { spectrumSpec } from './clipper'

type Proc = 'clip' | 'soft' | 'limit' | 'both'
type P = { driveDb: number; ceilingDb: number; proc: Proc }

export const clipVsLimitLab: LabDef<P> = {
  id: 'clipvslimit',
  title: 'Clip vs limit',
  tag: 'Dynamics',
  blurb: 'Same job, different method: reshape the waveform or turn the volume down.',
  concept: `Both stop the signal from going over a ceiling, but in completely different ways:

- A **clipper** works on **each sample on its own**. The waveform's shape changes, which creates harmonics (distortion), but there is no "movement" in level.
- A **limiter** works on the **volume over time**. The waveform keeps its shape and just gets quieter around peaks, with no added harmonics, but the level moves (pumping, softened transients).

Watch the gain lane: spiky and instant for the clipper, smooth for the limiter. Then look at the spectrum with the sine: the limiter adds nothing.`,
  sources: ['drums', 'sine', 'bass', 'mix'],
  params: [
    {
      key: 'proc', kind: 'choice', label: 'Processor', default: 'clip', highlight: 'proc',
      options: [
        { value: 'clip', label: 'Hard clip' }, { value: 'soft', label: 'Soft clip' },
        { value: 'limit', label: 'Limiter' }, { value: 'both', label: 'Clip → limit' },
      ],
      what: 'Which method keeps the signal under the ceiling. "Clip → limit" splits the work: half the drive into a clipper, the other half into a limiter.',
      hear: 'Clippers: harmonics and edge, transients stay sharp. Limiter: clean tone but softer punch. Clip → limit: often the loudest result before either one becomes obvious.',
      see: 'The gain lane (spiky vs smooth), the waveform shape when zoomed in, and the harmonics in the spectrum.',
      typical: 'Mastering engineers often clip 1-2 dB of the sharpest peaks, then let a limiter handle the rest.',
    },
    {
      key: 'driveDb', label: 'Drive', min: 0, max: 18, default: 9, step: 0.5, format: fmt.db, highlight: 'drive',
      what: 'How hard the signal is pushed into the ceiling.',
      hear: 'More drive gives more loudness, plus more distortion (clip) or more pumping (limit).',
      see: 'Deeper gain-lane activity and taller harmonic spikes.',
      typical: 'Compare the methods at the same drive and ceiling to keep it fair.',
    },
    {
      key: 'ceilingDb', label: 'Ceiling', min: -12, max: 0, default: -1, step: 0.5, format: fmt.db, highlight: 'ceiling',
      what: 'The maximum output level for every method.',
      hear: 'Sets the output level. The output peak readout matches it for all methods.',
      see: 'The dashed lines on the waveform.',
      typical: '-1 dBFS.',
    },
  ],
  render(src, p, { fs, source }) {
    let out: Float32Array
    let gainDb: Float32Array
    if (p.proc === 'limit') {
      const r = renderLimiter(src, fs, { inputDb: p.driveDb, ceilingDb: p.ceilingDb, releaseMs: 60, lookaheadMs: 3 })
      out = r.out
      gainDb = r.gainDb
    } else if (p.proc === 'both') {
      const half = p.driveDb / 2
      const clipped = renderClipper(src, { driveDb: half, ceilingDb: p.ceilingDb, mode: 'hard' })
      out = renderLimiter(clipped, fs, { inputDb: half, ceilingDb: p.ceilingDb, releaseMs: 60, lookaheadMs: 3 }).out
      gainDb = clipGainDb(src, out, p.driveDb)
    } else {
      out = renderClipper(src, { driveDb: p.driveDb, ceilingDb: p.ceilingDb, mode: p.proc === 'soft' ? 'soft' : 'hard' })
      gainDb = clipGainDb(src, out, p.driveDb)
    }
    return {
      fs,
      audio: { dry: src, wet: out },
      levelLines: [{ db: p.ceilingDb, label: 'Ceiling', highlight: 'ceiling' }],
      zones: p.proc === 'limit' ? envelopeZones(gainDb, fs, 'down') : [],
      lanes: [{ label: p.proc === 'limit' ? 'Gain reduction (smooth)' : 'Gain change per sample (instant)', kind: 'gain', data: gainDb, highlight: 'proc|drive' }],
      spectrum: spectrumSpec(src, out, fs, source === 'sine'),
    }
  },
  tour: [
    {
      text: 'Play the **drums** with **Hard clip**, 9 dB of drive. Zoom ×32 onto a kick: its peaks are sliced flat. The gain lane is a forest of thin spikes, because every sample is treated separately.',
      source: 'drums',
      set: { proc: 'clip', driveDb: 9, ceilingDb: -1 },
    },
    {
      text: 'Switch to **Limiter**. Same loudness, but the waveform keeps its shape and just gets smaller around each hit. The gain lane is now smooth: it dips and recovers over milliseconds.',
      set: { proc: 'limit' },
      check: (p) => p.proc === 'limit',
    },
    {
      text: 'Switch the source to the **100 Hz sine** and flip between **Hard clip** and **Limiter**. The clipper fills the spectrum with harmonics. The limiter just turns the steady sine down and adds **no** harmonics, because the gain isn\'t moving.',
      source: 'sine',
      check: (_p, s) => s === 'sine',
    },
    {
      text: 'Back on **Drums**, push **Drive** to **15 dB** and try **Clip → limit**. Each processor does half the work, so neither one is pushed into its obvious failure (harsh clipping or pumping). Use **Delta** to compare what each method removes.',
      source: 'drums',
      set: { proc: 'both', driveDb: 15 },
      check: (p, s) => p.proc === 'both' && s === 'drums',
    },
  ],
}
