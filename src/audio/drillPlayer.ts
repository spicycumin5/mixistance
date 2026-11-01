// Standalone A/B player for ear-training drills, independent of the mixer.
//
//   buffer → srcBus ─┬─> [processor A] ─> levelMatch ─> gainA ─┐
//                    └─> [processor B] ─> levelMatch ─> gainB ─┴─> out → destination

import type { EqBand } from '../dsp/biquad'
import type { CompressorParams } from '../dsp/compressorCore'
import { DEMO_BPM, generateDemoStems, pinkNoise } from './demoStems'
import { EqChain } from './eq'
import { engine } from './engine'

export type DrillSource = 'pink' | 'drums' | 'vox' | 'bass' | 'keys' | 'mix'

export const SOURCE_LABELS: Record<DrillSource, string> = {
  pink: 'Pink noise', drums: 'Drums', vox: 'Vocal', bass: 'Bass', keys: 'Keys', mix: 'Full mix',
}

export type ProcSpec =
  | { kind: 'dry' }
  | { kind: 'eq'; bands: EqBand[] }
  | { kind: 'comp'; params: CompressorParams }
  | { kind: 'gain'; db: number }

interface Path {
  gain: GainNode
  nodes: AudioNode[]
  eq?: EqChain
}

const cache = new Map<DrillSource, AudioBuffer>()

function sourceBuffer(src: DrillSource): AudioBuffer {
  const ctx = engine.ctx
  const hit = cache.get(src)
  if (hit) return hit
  const fs = ctx.sampleRate
  let data: Float32Array
  if (src === 'pink') {
    data = pinkNoise(fs, 8)
  } else {
    const stems = generateDemoStems(fs)
    // 2 bars is plenty to loop and keeps comparisons tight.
    const len = Math.floor((60 / DEMO_BPM) * 8 * fs)
    const pickIds = src === 'drums' ? ['kick', 'snare', 'hats'] : src === 'mix' ? stems.map((s) => s.id) : [src]
    data = new Float32Array(len)
    for (const s of stems) {
      if (!pickIds.includes(s.id)) continue
      const g = src === 'mix' || src === 'drums' ? Math.pow(10, s.faderDb / 20) : 1
      for (let i = 0; i < len; i++) data[i] += s.data[i] * g
    }
    let m = 0
    for (const x of data) m = Math.max(m, Math.abs(x))
    for (let i = 0; i < len; i++) data[i] *= 0.5 / (m || 1)
  }
  const buf = ctx.createBuffer(1, data.length, fs)
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  cache.set(src, buf)
  return buf
}

class DrillPlayer {
  private srcBus?: GainNode
  private out?: GainNode
  private source?: AudioBufferSourceNode
  private paths: Path[] = []
  private current = 0
  private buffer?: AudioBuffer
  playing = false
  volumeDb = -6

  private async ensure() {
    await engine.init()
    const ctx = engine.ctx
    if (ctx.state === 'suspended') await ctx.resume()
    if (!this.srcBus) {
      this.srcBus = ctx.createGain()
      this.out = ctx.createGain()
      this.out.gain.value = Math.pow(10, this.volumeDb / 20)
      this.out.connect(ctx.destination)
    }
    return ctx
  }

  async setSource(src: DrillSource) {
    await this.ensure()
    this.buffer = sourceBuffer(src)
    if (this.playing) this.startSource()
  }

  /** Replace the A/B paths. levelMatch makes each processed path as loud as the dry signal. */
  async setPaths(specs: ProcSpec[], levelMatch = true) {
    const ctx = await this.ensure()
    for (const p of this.paths) {
      p.gain.disconnect()
      p.nodes.forEach((n) => n.disconnect())
    }
    this.paths = specs.map((spec, i) => {
      const gain = ctx.createGain()
      gain.gain.value = i === this.current ? 1 : 0
      const nodes: AudioNode[] = []
      let head: AudioNode = this.srcBus!
      let eq: EqChain | undefined
      if (spec.kind === 'eq') {
        eq = new EqChain(ctx, spec.bands.length)
        eq.set(spec.bands)
        head.connect(eq.input)
        head = eq.output
        nodes.push(...eq.filters)
      } else if (spec.kind === 'comp') {
        const comp = new AudioWorkletNode(ctx, 'mx-compressor', { outputChannelCount: [2] })
        comp.port.postMessage({ params: spec.params })
        head.connect(comp)
        head = comp
        nodes.push(comp)
      } else if (spec.kind === 'gain') {
        const g = ctx.createGain()
        g.gain.value = Math.pow(10, spec.db / 20)
        head.connect(g)
        head = g
        nodes.push(g)
      }
      if (levelMatch && spec.kind !== 'dry' && spec.kind !== 'gain') {
        const m = new AudioWorkletNode(ctx, 'mx-levelmatch', { numberOfInputs: 2, outputChannelCount: [2] })
        head.connect(m, 0, 0)
        this.srcBus!.connect(m, 0, 1)
        head = m
        nodes.push(m)
      }
      head.connect(gain).connect(this.out!)
      return { gain, nodes, eq }
    })
  }

  /** Update a live EQ path (used by EQ match, where the learner edits path 1). */
  updateEq(pathIndex: number, bands: EqBand[]) {
    this.paths[pathIndex]?.eq?.set(bands)
  }

  select(i: number) {
    this.current = i
    if (!engine.ctx) return
    const t = engine.ctx.currentTime
    this.paths.forEach((p, j) => p.gain.gain.setTargetAtTime(j === i ? 1 : 0, t, 0.012))
  }

  get selected() {
    return this.current
  }

  private startSource() {
    const ctx = engine.ctx
    this.source?.stop()
    this.source?.disconnect()
    if (!this.buffer) return
    const s = ctx.createBufferSource()
    s.buffer = this.buffer
    s.loop = true
    s.connect(this.srcBus!)
    s.start()
    this.source = s
  }

  async play() {
    await this.ensure()
    if (engine.playing) engine.stop() // don't hear the mix underneath a drill
    this.startSource()
    this.playing = true
  }

  stop() {
    this.source?.stop()
    this.source?.disconnect()
    this.source = undefined
    this.playing = false
  }
}

export const drillPlayer = new DrillPlayer()
