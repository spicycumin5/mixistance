import { renderLimiter } from '../../dsp/limiterCore'
import { AMBER, fmt } from '../common'
import { envelopeZones } from '../helpers'
import type { LabDef } from '../types'

type P = { inputDb: number; ceilingDb: number; releaseMs: number; lookaheadMs: number }

export const limiterLab: LabDef<P> = {
  id: 'limiter',
  title: 'Limiter',
  tag: 'Dynamics',
  blurb: 'A brick wall: nothing gets past the ceiling, ever.',
  concept: `A limiter is a compressor taken to the extreme: **infinite ratio** and a **guarantee** that no sample goes over the **ceiling**.

To keep that guarantee without distorting, it **looks ahead**. The output is delayed a few milliseconds, so the limiter sees each peak coming and lowers the gain smoothly *before* it arrives.

You use it last in the chain, to make a track louder (push **Input**) without clipping the output. The price is that the louder you push, the more the peaks get flattened and the more the gain moves around.`,
  sources: ['drums', 'mix', 'snare', 'bass', 'bursts'],
  params: [
    {
      key: 'inputDb', label: 'Input', min: 0, max: 24, default: 0, step: 0.5, format: fmt.db, highlight: 'input',
      what: 'Gain before the limiter. This is the "loudness" knob: everything goes up, and the peaks get held at the ceiling.',
      hear: 'Louder and denser. Past ~6-8 dB of gain reduction, drums lose snap and the mix starts to flatten or crunch.',
      see: 'The transfer curve slides left, so the brick wall arrives at lower input levels. The gain-reduction lane gets deeper.',
      typical: 'Mastering: aim for 1-4 dB of gain reduction on the loudest peaks, more for loud genres.',
    },
    {
      key: 'ceilingDb', label: 'Ceiling', min: -12, max: 0, default: -1, step: 0.1, format: fmt.db, highlight: 'ceiling',
      what: 'The maximum output level. No sample goes above it.',
      hear: 'Lower ceiling means quieter output and more limiting at the same input.',
      see: 'The dashed lines on the waveform and the flat top of the transfer curve. The output peak readout never exceeds it.',
      typical: '-1 dBFS is a common safe ceiling, leaving room for lossy encoding (MP3/AAC) to avoid inter-sample overs.',
    },
    {
      key: 'releaseMs', label: 'Release', min: 1, max: 1000, default: 60, log: true, format: fmt.ms, highlight: 'release',
      what: 'How fast the gain recovers after a peak.',
      hear: 'Very fast release (<10 ms) follows individual waveform cycles and distorts bass. Slow release (>300 ms) pumps and holds everything down after big hits.',
      see: 'The "release" spans: how quickly the gain-reduction lane climbs back to 0.',
      typical: '30-150 ms, or an "auto" release in commercial limiters.',
    },
    {
      key: 'lookaheadMs', label: 'Lookahead', min: 0, max: 10, default: 5, step: 0.1, format: fmt.ms, highlight: 'attack',
      what: 'How far ahead the limiter sees. It is also the time it has to fade the gain down before a peak.',
      hear: 'At 0 the gain has to snap down instantly, which crunches like a clipper. A few milliseconds lets it duck smoothly.',
      see: 'The "attack" spans: the gain ramps down just before each peak. At 0 the gain-reduction lane becomes spiky.',
      typical: '1-5 ms. Longer is smoother but can soften transients.',
    },
  ],
  render(src, p, { fs }) {
    const r = renderLimiter(src, fs, p)
    const T = p.ceilingDb - p.inputDb
    return {
      fs,
      audio: { dry: src, wet: r.out },
      levelLines: [{ db: p.ceilingDb, label: 'Ceiling', highlight: 'ceiling' }],
      zones: envelopeZones(r.gainDb, fs, 'down'),
      lanes: [{ label: 'Gain reduction', kind: 'gain', data: r.gainDb, highlight: 'attack|release|input|ceiling' }],
      curve: {
        title: 'Static curve', unit: 'dB', lo: -48, hi: 0, xLabel: 'input dB', yLabel: 'output dB',
        lines: [
          { fn: (x) => x, color: '#4a4b57', dash: [4, 4], label: '1:1' },
          { fn: (x) => Math.min(x + p.inputDb, p.ceilingDb), color: AMBER, width: 2.5, label: 'Limiter', highlight: 'input|ceiling' },
        ],
        hlines: [{ y: p.ceilingDb, label: 'ceiling', highlight: 'ceiling' }],
        vlines: [{ x: T, label: 'limit starts', highlight: 'input' }],
      },
    }
  },
  tour: [
    {
      text: 'Play the **drums**. Their peaks sit at -6 dBFS, under the -1 dB ceiling, so the limiter does nothing. Now raise **Input** to **+6 dB**. The loud hits now reach the ceiling lines and stop there, and the output peak readout never goes past -1.',
      source: 'drums',
      set: { inputDb: 6, ceilingDb: -1, releaseMs: 60, lookaheadMs: 5 },
      check: (p) => p.inputDb >= 5,
    },
    {
      text: 'Push **Input** to **+15 dB**. It is much louder, but look at the gain-reduction lane: the limiter is working on almost every hit. Switch to **Delta** to hear what is being taken away. That is your punch.',
      set: { inputDb: 15 },
      check: (p) => p.inputDb >= 12,
    },
    {
      text: 'Set **Lookahead** to **0**. Without warning, the gain has to snap down on the exact sample of each peak. Zoom into a kick: the gain-reduction lane goes spiky and the sound crunches, much like a clipper.',
      set: { lookaheadMs: 0 },
      check: (p) => p.lookaheadMs <= 0.2,
    },
    {
      text: 'Restore **Lookahead** to 5 ms and set **Release** to **3 ms**. The gain now moves within each bass cycle, which is distortion. Then try **800 ms**: the whole loop stays turned down after the first big hit (pumping). Settle around 50-100 ms.',
      set: { lookaheadMs: 5, releaseMs: 3 },
      check: (p) => p.releaseMs <= 5 || p.releaseMs >= 600,
    },
  ],
}
