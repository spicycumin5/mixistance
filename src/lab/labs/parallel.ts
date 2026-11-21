import { renderCompressor } from '../../dsp/compressorCore'
import { COMP_PARAMS, compParams, compressorCurve, fmt } from '../common'
import { envelopeZones, lin } from '../helpers'
import type { LabDef } from '../types'

type P = { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; makeupDb: number; parallelDb: number }

const OFF = -40
const wetGain = (db: number) => (db <= OFF ? 0 : lin(db))

export const parallelLab: LabDef<P> = {
  id: 'parallel',
  title: 'Parallel processing',
  tag: 'Technique',
  blurb: 'Blend a heavily processed copy under the original: density without losing punch.',
  concept: `Instead of putting a processor **in line**, you split the signal in two. The **dry** path stays untouched, and the **wet** path gets processed hard, often squashed flat. Then you **add them back together**.

The quiet details (decays, ghost notes, breaths) get a big boost from the squashed copy. The loud transients barely change, because the dry path's peaks are much bigger than anything the squashed copy adds. The result is **upward compression**: the floor comes up and the peaks stay intact.

The same idea works with saturation (parallel distortion) and reverb (which is always parallel: a send).`,
  sources: ['drums', 'snare', 'vox', 'bass'],
  params: [
    { ...COMP_PARAMS.thresholdDb, default: -40, see: 'Threshold applies to the wet (squashed) path only. Set it low so almost everything is compressed.' },
    { ...COMP_PARAMS.ratio, default: 12 },
    { ...COMP_PARAMS.attackMs, default: 1, typical: 'Fast (0.5-3 ms) on the wet path, so it carries the body and none of the transient. The dry path supplies the punch.' },
    { ...COMP_PARAMS.releaseMs, default: 150 },
    { ...COMP_PARAMS.makeupDb, default: 15, typical: 'Enough to bring the squashed path back to a similar level as the dry. Then set the blend with Parallel level.' },
    {
      key: 'parallelDb', label: 'Parallel', min: OFF, max: 6, default: OFF, step: 0.5, highlight: 'blend',
      format: (v) => (v <= OFF ? 'off' : fmt.db(v)),
      what: 'How loud the squashed copy is mixed in under the untouched original.',
      hear: 'As you raise it, the room, decays and low-level detail come forward and the sound gets denser, while hits keep their attack.',
      see: 'The amber "Dry + wet" curve lifts at low input levels (left side) but stays close to the diagonal at high levels (right side). That is upward compression.',
      typical: 'Bring it up until you notice it, then back off a little. Often 6-12 dB below the dry signal.',
    },
  ],
  render(src, p, { fs }) {
    const cp = compParams({ ...p, kneeDb: 6 })
    const r = renderCompressor(src, fs, cp)
    const w = wetGain(p.parallelDb)
    const wetPath = new Float32Array(src.length)
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i++) {
      wetPath[i] = r.out[i] * w
      out[i] = src[i] + wetPath[i]
    }
    return {
      fs,
      audio: { dry: src, wet: out },
      levelLines: [{ db: cp.thresholdDb, label: 'Wet threshold', highlight: 'threshold' }],
      zones: envelopeZones(r.gainDb, fs, 'down'),
      lanes: [
        { label: 'Wet path (squashed copy, at its blend level)', kind: 'wave', data: wetPath, color: '#f5a524', highlight: 'blend|makeup' },
        { label: 'Wet path gain reduction', kind: 'gain', data: r.gainDb, highlight: 'attack|release|threshold|ratio' },
      ],
      curve: compressorCurve(cp, { dry: 1, wet: w, label: 'Dry + wet', highlight: 'blend' }),
    }
  },
  tour: [
    {
      text: 'Play the **drums** with **Parallel** off: you hear only the dry path. The wet path is already set up to crush everything (low threshold, high ratio, fast attack). Switch to **Delta**. Once the blend is up, this is the squashed copy on its own.',
      source: 'drums',
      set: { parallelDb: OFF, thresholdDb: -40, ratio: 12, attackMs: 1, makeupDb: 15 },
    },
    {
      text: 'Back on **Processed**, raise **Parallel** to about **-6 dB**. The decays and room come up and the kit gets thicker, yet every hit still cracks. On the curve, the low end of the line lifts while the top stays near the diagonal.',
      set: { parallelDb: -6 },
      check: (p) => p.parallelDb > -12,
    },
    {
      text: 'Turn on **Match loudness** (it should already be on) and flip Dry/Processed. Even at equal loudness, Processed sounds denser. Compare with the plain Compressor lab, where you can only get density by flattening the peaks.',
    },
    {
      text: 'Set the wet path **Attack** to **40 ms**. Now the squashed copy has transients too, so the peaks grow as well and the effect turns into "everything louder". Fast attack on the wet path is what keeps parallel compression clean.',
      set: { attackMs: 40 },
      check: (p) => p.attackMs >= 25,
    },
  ],
}
