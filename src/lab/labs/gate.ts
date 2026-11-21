import { gateStaticGain, renderGate } from '../../dsp/gateCore'
import { AMBER, fmt } from '../common'
import { envelopeZones } from '../helpers'
import type { LabDef } from '../types'

type P = { thresholdDb: number; ratio: number; rangeDb: number; attackMs: number; holdMs: number; releaseMs: number }

export const gateLab: LabDef<P> = {
  id: 'gate',
  title: 'Gate & expander',
  tag: 'Dynamics',
  blurb: 'The opposite of a compressor: makes the quiet parts quieter.',
  concept: `A **gate** is a door that only opens when the signal is loud enough. Below the **threshold** it closes and turns the sound down by the **range**. Use it to remove hiss, hum or bleed between drum hits and vocal phrases.

An **expander** is a gentle gate. Instead of slamming shut, it pushes quiet sound down by a **ratio** (at 2:1, every dB under the threshold becomes 2 dB). That sounds more natural.

The timing controls matter more than on a compressor: **attack** (how fast it opens), **hold** (how long it stays open) and **release** (how fast it closes).`,
  sources: ['drumsNoise', 'voxNoise', 'snare', 'bursts'],
  defaultScale: 'db',
  params: [
    {
      key: 'thresholdDb', label: 'Threshold', min: -80, max: 0, default: -60, step: 0.5, format: fmt.db, highlight: 'threshold',
      what: 'The level the signal must exceed to open the gate.',
      hear: 'Too low: the noise opens the gate and nothing changes. Too high: quiet notes and soft hits get cut off.',
      see: 'The dashed line on the waveform (dB view). Everything below it is attenuated.',
      typical: 'Just above the noise floor and well below the quietest part you want to keep.',
    },
    {
      key: 'ratio', label: 'Ratio', min: 1, max: 20, default: 20, log: true, highlight: 'ratio',
      format: (v) => (v >= 19.5 ? 'gate' : `1:${v.toFixed(1)}`),
      what: 'How steeply level is pushed down below the threshold. Maximum = a hard gate.',
      hear: 'Low ratios (1:2) gently reduce noise and bleed. A gate cuts it off completely.',
      see: 'The slope of the transfer curve below the threshold.',
      typical: '1:2-1:4 for natural cleanup (expander). Gate for drums in a busy mix.',
    },
    {
      key: 'rangeDb', label: 'Range', min: 0, max: 80, default: 40, step: 1, format: (v) => `-${Math.round(v)} dB`, highlight: 'range',
      what: 'The most the gate will turn the sound down when it is closed.',
      hear: 'Full range gives total silence between hits, which can sound unnatural. 10-20 dB just tucks the noise under the mix.',
      see: 'The floor of the transfer curve and the deepest point of the attenuation lane.',
      typical: '10-20 dB for vocals and toms, more for noisy recordings.',
    },
    {
      key: 'attackMs', label: 'Attack', min: 0.05, max: 50, default: 0.5, log: true, format: fmt.ms, highlight: 'attack',
      what: 'How fast the gate opens when the signal crosses the threshold.',
      hear: 'Too slow chops off the start of each hit (it loses its click). Extremely fast can click.',
      see: 'The "attack" spans: the attenuation lane rising back to 0.',
      typical: '0.1-1 ms for drums, 1-5 ms for vocals.',
    },
    {
      key: 'holdMs', label: 'Hold', min: 0, max: 500, default: 40, step: 1, format: fmt.ms, highlight: 'hold',
      what: 'How long the gate stays fully open after the signal drops below the threshold, before release begins.',
      hear: 'Without hold, decays flutter as the gate opens and closes on the waveform ("chatter").',
      see: 'A flat stretch at 0 dB in the attenuation lane after each hit, before it starts to fall.',
      typical: '20-100 ms, roughly the length of the note\'s body.',
    },
    {
      key: 'releaseMs', label: 'Release', min: 5, max: 2000, default: 120, log: true, format: fmt.ms, highlight: 'release',
      what: 'How fast the gate closes after the hold time.',
      hear: 'Too fast chops tails off abruptly. Too slow lets the noise "swoosh" after each hit.',
      see: 'The "release" spans: the attenuation lane falling.',
      typical: '50-300 ms. Follow the natural decay of the instrument.',
    },
  ],
  render(src, p, { fs }) {
    const r = renderGate(src, fs, p)
    return {
      fs,
      audio: { dry: src, wet: r.out },
      levelLines: [{ db: p.thresholdDb, label: 'Threshold', highlight: 'threshold' }],
      zones: envelopeZones(r.gainDb, fs, 'up'),
      lanes: [{ label: 'Attenuation', kind: 'gain', data: r.gainDb, highlight: 'attack|hold|release|range|threshold' }],
      curve: {
        title: 'Transfer curve', unit: 'dB', lo: -90, hi: 0, xLabel: 'input dB', yLabel: 'output dB',
        lines: [
          { fn: (x) => x, color: '#4a4b57', dash: [4, 4], label: '1:1' },
          { fn: (x) => x - p.rangeDb, color: '#fde68a', dash: [2, 3], onlyActive: true, highlight: 'range' },
          { fn: (x) => x + gateStaticGain(x, p), color: AMBER, width: 2.5, label: 'Gate', highlight: 'ratio|range' },
        ],
        vlines: [{ x: p.thresholdDb, label: 'T', highlight: 'threshold' }],
      },
    }
  },
  tour: [
    {
      text: 'Play **Drums + noise** and look at the waveform in **dB** view: a carpet of hiss sits around -45 dB between the hits. With the threshold at -60 dB the hiss keeps the gate open, so nothing happens.',
      source: 'drumsNoise',
      set: { thresholdDb: -60, ratio: 20, rangeDb: 40, attackMs: 0.5, holdMs: 40, releaseMs: 120 },
    },
    {
      text: 'Raise **Threshold** to about **-30 dB**, above the noise but below the hits. The hiss between hits disappears. The attenuation lane shows the gate slamming shut after every hit.',
      set: { thresholdDb: -30 },
      check: (p) => p.thresholdDb >= -36 && p.thresholdDb <= -15,
    },
    {
      text: 'Set **Hold** to **0** and **Release** to **10 ms**. Snare tails get chopped short, and you may hear chatter as the gate flaps on the decay. Then try **Release 400 ms**: smooth, but the hiss "swooshes" after each hit. Find the middle.',
      set: { holdMs: 0, releaseMs: 10 },
      check: (p) => p.releaseMs <= 15 || p.releaseMs >= 300,
    },
    {
      text: 'Set **Range** to **12 dB** and **Ratio** to about **1:2.5**. Now it is an expander: the noise is pushed down, not removed, which is far less noticeable in a mix. Watch the transfer curve go from a cliff to a gentle slope.',
      set: { rangeDb: 12, ratio: 2.5, holdMs: 40, releaseMs: 120 },
      check: (p) => p.rangeDb <= 20 && p.ratio < 6,
    },
    {
      text: 'Back to a full gate (ratio max, range 40) and set **Attack** to **20 ms**. Zoom into a hit: the gate opens too slowly and shaves off the click at the start. Fast attack is essential on drums.',
      set: { ratio: 20, rangeDb: 40, attackMs: 20 },
      check: (p) => p.attackMs >= 12,
    },
  ],
}
