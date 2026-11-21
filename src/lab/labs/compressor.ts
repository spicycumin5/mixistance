import { renderCompressor } from '../../dsp/compressorCore'
import { COMP_PARAMS, compParams, compressorCurve, MIX_PARAM } from '../common'
import { envelopeZones, mixDryWet } from '../helpers'
import type { LabDef } from '../types'

type P = { thresholdDb: number; ratio: number; kneeDb: number; attackMs: number; releaseMs: number; makeupDb: number; mix: number }

export const compressorLab: LabDef<P> = {
  id: 'compressor',
  title: 'Compressor',
  tag: 'Dynamics',
  blurb: 'Turns down the loud parts, so loud and quiet sit closer together.',
  concept: `A compressor is an **automatic volume fader** with a fast hand. When the signal goes over the **threshold**, it turns the volume down by an amount set by the **ratio**. **Attack** and **release** set how quickly that hand moves.

The result is a smaller gap between loud and quiet, the **dynamic range**. Add **makeup** gain afterwards and everything sounds denser and more even.`,
  sources: ['bursts', 'snare', 'drums', 'vox', 'bass'],
  params: [COMP_PARAMS.thresholdDb, COMP_PARAMS.ratio, COMP_PARAMS.kneeDb, COMP_PARAMS.attackMs, COMP_PARAMS.releaseMs, COMP_PARAMS.makeupDb, MIX_PARAM],
  render(src, p, { fs }) {
    const cp = compParams(p)
    const r = renderCompressor(src, fs, cp)
    const m = p.mix / 100
    return {
      fs,
      audio: { dry: src, wet: mixDryWet(src, r.out, m) },
      levelLines: [{ db: cp.thresholdDb, label: 'Threshold', highlight: 'threshold' }],
      zones: envelopeZones(r.gainDb, fs, 'down'),
      lanes: [{ label: 'Gain reduction', kind: 'gain', data: r.gainDb, highlight: 'attack|release|threshold|ratio' }],
      curve: compressorCurve(cp, m < 1 ? { dry: 1 - m, wet: m, label: 'Blended', highlight: 'mix' } : undefined),
    }
  },
  tour: [
    {
      text: 'The **tone bursts** step between loud, quiet and silent. Press **Play**. Grey is the input, amber the output. With the threshold at 0 dB nothing goes over it, so the two are identical.',
      source: 'bursts',
      set: { thresholdDb: 0, ratio: 4, attackMs: 10, releaseMs: 120, makeupDb: 0, mix: 100 },
    },
    {
      text: 'Lower **Threshold** to about **-20 dB**. Now only the loud bursts go over the dashed line. Watch them shrink while the quiet ones stay put, and the gain-reduction lane start moving.',
      set: { thresholdDb: -20 },
      check: (p) => p.thresholdDb <= -16,
    },
    {
      text: 'Raise **Ratio** to **10:1** or more. On the transfer curve the line above the threshold goes almost flat: a big change in input now gives a tiny change in output.',
      set: { ratio: 12 },
      check: (p) => p.ratio >= 8,
    },
    {
      text: 'Set **Attack** to **50 ms** or more. Zoom into the start of a loud burst (Zoom ×16). The output stays loud for a moment before the compressor clamps down. That overshoot is the "punch" slow attack preserves on drums.',
      set: { attackMs: 60 },
      check: (p) => p.attackMs >= 40,
    },
    {
      text: 'Set **Release** to **1000 ms**. Look at the -20 dB step right after a loud burst: it stays turned down because the compressor has not recovered yet. Switch to **Delta** to hear only what the compressor is removing.',
      set: { releaseMs: 1000 },
      check: (p) => p.releaseMs >= 600,
    },
    {
      text: 'Bring Release back to ~120 ms and raise **Makeup** until Processed is as loud as Dry. Now the quiet parts are louder than before. That is why compressed sounds feel "bigger". Finally, switch to **Snare** and use what you learned to even out the uneven hits.',
      set: { releaseMs: 120, makeupDb: 8 },
      check: (p, s) => p.makeupDb >= 4 && s === 'snare',
    },
  ],
}
