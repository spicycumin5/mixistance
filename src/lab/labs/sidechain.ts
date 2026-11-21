import { LAB_FS, stemLoop } from '../../audio/sources'
import { renderCompressor } from '../../dsp/compressorCore'
import { COMP_PARAMS, compParams, compressorCurve } from '../common'
import { envelopeZones } from '../helpers'
import type { LabDef } from '../types'

type P = { key: 'kick' | 'self'; thresholdDb: number; ratio: number; attackMs: number; releaseMs: number }

let kickCache: Float32Array | undefined
const kick = () => (kickCache ??= stemLoop('kick', LAB_FS))

export const sidechainLab: LabDef<P> = {
  id: 'sidechain',
  title: 'Sidechain compression',
  tag: 'Technique',
  blurb: 'One track turns another down. Carve room for the kick, or make a pad pump.',
  concept: `Normally a compressor listens to the same signal it turns down. With a **sidechain**, it listens to a *different* signal, the **key**, and turns down the track it is inserted on.

Put a compressor on the bass, key it from the kick, and the bass dips every time the kick hits. The two stop fighting for the same low-end space. Push it harder on a sustained pad and you get the classic **pumping** of dance music.

The rule to remember: the **key decides when** compression happens, and the track being compressed is **what** gets turned down.`,
  sources: ['keys', 'bass', 'vox'],
  params: [
    {
      key: 'key', kind: 'choice', label: 'Detector', default: 'kick', highlight: 'key',
      options: [{ value: 'kick', label: 'Key: kick' }, { value: 'self', label: 'Self (normal)' }],
      what: 'What the compressor listens to. "Key: kick" uses the kick drum as an external sidechain. "Self" is a normal compressor.',
      hear: 'With the kick key, the track ducks in time with the kick even if its own level never changes.',
      see: 'The kick lane lines up with dips in the gain-reduction lane. In Self mode, the gain reduction follows the track\'s own level instead.',
      typical: 'Kick → bass for low-end clarity. Kick → pads or full music bus for pumping. Vocal → music to "make room" for the voice.',
    },
    { ...COMP_PARAMS.thresholdDb, default: -24, see: 'Compared against the key\'s level (the kick), not the track\'s.' },
    { ...COMP_PARAMS.ratio, default: 8 },
    { ...COMP_PARAMS.attackMs, default: 1, typical: 'Fast (0.5-5 ms) so the dip arrives with the kick\'s transient.' },
    {
      ...COMP_PARAMS.releaseMs, default: 150,
      hear: 'Short release gives a quick dip that just clears space for the kick. Long release gives a slow swell back, which is the audible "pump".',
      typical: 'Clarity: 50-120 ms. Pumping: time it to the beat, e.g. 1/8 note (≈310 ms at 96 BPM) so it swells back just before the next kick.',
    },
  ],
  render(src, p, { fs }) {
    const k = kick()
    const n = Math.min(src.length, k.length)
    const main = src.subarray(0, n)
    const key = k.subarray(0, n)
    const r = renderCompressor(main, fs, { ...compParams({ ...p, kneeDb: 3, makeupDb: 0 }) }, p.key === 'kick' ? key : undefined)
    const dry = new Float32Array(n)
    const wet = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const kk = key[i] * 0.6
      dry[i] = main[i] + kk
      wet[i] = r.out[i] + kk
    }
    const cp = compParams({ ...p, kneeDb: 3, makeupDb: 0 })
    return {
      fs,
      audio: { dry, wet },
      show: { dry: main, wet: r.out, label: 'Track being ducked (the kick still plays, unprocessed)' },
      zones: envelopeZones(r.gainDb, fs, 'down'),
      lanes: [
        { label: p.key === 'kick' ? 'Key: kick drum (what the compressor listens to)' : 'Key: kick (ignored in Self mode)', kind: 'wave', data: key, color: '#f97316', highlight: 'key|threshold' },
        { label: 'Gain reduction on the track', kind: 'gain', data: r.gainDb, highlight: 'key|attack|release|threshold|ratio' },
      ],
      curve: { ...compressorCurve(cp), xLabel: p.key === 'kick' ? 'key level dB' : 'input dB' },
    }
  },
  tour: [
    {
      text: 'Play the **Keys** pad: a sustained chord with no dynamics of its own. The detector is keyed from the **kick**, and the pad dips every time the kick hits. Compare the orange kick lane with the gain-reduction lane: they line up.',
      source: 'keys',
      set: { key: 'kick', thresholdDb: -24, ratio: 8, attackMs: 1, releaseMs: 150 },
    },
    {
      text: 'Set **Release** to about **310 ms** (an 1/8 note at 96 BPM). The pad now swells back just in time for the next kick: the classic dance-music **pump**. Try **60 ms** too: a quick dip, barely noticeable as an effect, but it clears space for the kick.',
      set: { releaseMs: 310 },
      check: (p) => p.releaseMs >= 250,
    },
    {
      text: 'Switch **Detector** to **Self**. Same settings, but the pad now listens to itself. It is steady, so almost nothing happens. The key decides **when**. The track decides **what** gets turned down.',
      set: { key: 'self' },
      check: (p) => p.key === 'self',
    },
    {
      text: 'Now the practical use: switch to **Bass**, set the detector back to **Key: kick**, **Release ~100 ms**, and adjust **Threshold** for 4-6 dB of reduction. Listen to the low end on **Processed** vs **Dry**: the kick punches through instead of blurring into the bass. Use **Delta** to hear exactly what was carved out.',
      source: 'bass',
      set: { key: 'kick', releaseMs: 100 },
      check: (p, s) => s === 'bass' && p.key === 'kick',
    },
  ],
}
