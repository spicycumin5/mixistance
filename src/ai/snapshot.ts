// Accumulates spectrum/level statistics while the mix plays, so feedback reflects the
// whole section rather than a single instant. Sends numbers only, never audio.

import { bandEnergies, type LevelProbe } from '../audio/analysis'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'

interface Acc {
  bands: Record<string, number> // summed linear power per band
  frames: number
  peakDb: number
  rmsPow: number
}

const accs = new Map<string, Acc>()

function accumulate(key: string, probe: LevelProbe) {
  const { peakDb, rmsDb } = probe.levels()
  if (rmsDb < -80) return // silent frame (gap between notes or muted)
  const e = bandEnergies(probe.spectrum(), probe.binHz())
  const a = accs.get(key) ?? { bands: {}, frames: 0, peakDb: -120, rmsPow: 0 }
  for (const [k, v] of Object.entries(e)) a.bands[k] = (a.bands[k] ?? 0) + Math.pow(10, v / 10)
  a.frames++
  a.peakDb = Math.max(a.peakDb, peakDb)
  a.rmsPow += Math.pow(10, rmsDb / 10)
  accs.set(key, a)
}

let timer: ReturnType<typeof setInterval> | undefined

export function startSnapshotCollector() {
  if (timer) return
  timer = setInterval(() => {
    if (!engine.playing || engine.listenToRef) return
    for (const [id, strip] of engine.strips) accumulate(id, strip.probe)
    if (engine.masterProbe) accumulate('master', engine.masterProbe)
  }, 250)
}

export function resetSnapshot() {
  accs.clear()
}

const r1 = (x: number) => Math.round(x * 10) / 10

function summarize(key: string) {
  const a = accs.get(key)
  if (!a || !a.frames) return null
  const rmsDb = 10 * Math.log10(a.rmsPow / a.frames)
  return {
    bandsDb: Object.fromEntries(Object.entries(a.bands).map(([k, v]) => [k, r1(10 * Math.log10(v / a.frames))])),
    peakDb: r1(a.peakDb),
    rmsDb: r1(rmsDb),
    crestDb: r1(a.peakDb - rmsDb),
  }
}

/** Everything the coach needs to reason about the mix. */
export function buildSnapshot() {
  const { mix } = useStore.getState()
  const anySolo = mix.channels.some((c) => c.solo)
  return {
    secondsAnalyzed: r1((accs.get('master')?.frames ?? 0) * 0.25),
    master: { ...summarize('master'), loudness: engine.loudness, masterFaderDb: mix.masterDb },
    fx: {
      reverbDecaySec: mix.reverbDecay, reverbReturnDb: mix.reverbReturnDb,
      delayBeats: mix.delayBeats, delayFeedback: mix.delayFeedback, delayReturnDb: mix.delayReturnDb, bpm: mix.bpm,
    },
    channels: mix.channels.map((c) => ({
      id: c.id,
      name: c.name,
      audible: !c.mute && (!anySolo || c.solo),
      trimDb: c.gainDb,
      faderDb: c.faderDb,
      pan: c.pan,
      eq: c.eqOn
        ? c.eq.map((b, i) => ({ index: i, type: b.type, enabled: b.enabled, freq: b.freq, gainDb: b.gainDb, q: b.q }))
        : 'bypassed',
      compressor: c.compOn ? { ...c.comp, recentMaxGrDb: r1(engine.strips.get(c.id)?.grRecentMax ?? 0) } : 'bypassed',
      reverbSendDb: c.reverbSendDb,
      delaySendDb: c.delaySendDb,
      analysis: summarize(c.id),
    })),
  }
}

export type MixSnapshot = ReturnType<typeof buildSnapshot>
