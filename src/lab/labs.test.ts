import { describe, expect, it } from 'vitest'
import { LAB_FS, sourceData } from '../audio/sources'
import { LABS } from '.'
import { envelopeZones } from './helpers'
import { defaultsOf, type LabRender } from './types'

describe('processor labs render cleanly', () => {
  // Reverb needs OfflineAudioContext (browser only).
  for (const lab of LABS.filter((l) => l.id !== 'reverb')) {
    for (const source of lab.sources.slice(0, 2)) {
      it(`${lab.id} on ${source}`, async () => {
        const params = defaultsOf(lab)
        for (const step of lab.tour) Object.assign(params, step.set ?? {}) // also exercise the tour settings
        const r = (await lab.render(sourceData(source, LAB_FS), params, { fs: LAB_FS, source })) as LabRender
        const { dry, wet } = r.audio
        expect(wet.length).toBe(dry.length)
        expect(wet.every(Number.isFinite)).toBe(true)
        for (const l of r.lanes ?? []) expect(l.data.length).toBe((r.show ?? r.audio).dry.length)
      })
    }
  }
})

describe('every tour step checks against real parameter keys', () => {
  for (const lab of LABS) {
    it(lab.id, () => {
      const keys = new Set(lab.params.map((p) => p.key))
      for (const step of lab.tour) for (const k of Object.keys(step.set ?? {})) expect(keys).toContain(k)
      for (const s of lab.tour) if (s.source) expect(lab.sources).toContain(s.source)
    })
  }
})

describe('envelope zones', () => {
  it('labels a falling gain as attack and a rising gain as release', () => {
    const fs = 48000
    const g = new Float32Array(fs)
    for (let i = 0; i < fs; i++) g[i] = i < fs / 2 ? -10 * (i / (fs / 2)) : -10 + 10 * ((i - fs / 2) / (fs / 2))
    const z = envelopeZones(g, fs, 'down')
    expect(z.map((x) => x.highlight)).toEqual(['attack', 'release'])
  })
})
