// Owns the AudioContext, mix graph, and transport. The Zustand store is the source of
// truth for parameters; `sync()` pushes the whole mix state into the graph.

import type { LoudnessReading } from '../dsp/loudness'
import type { MixState } from '../state/types'
import { dbToGain, LevelProbe } from './analysis'
import { ChannelStrip } from './channel'
import { DelayBus, ReverbBus } from './fx'
import compressorUrl from './worklets/compressor.worklet.ts?worker&url'
import levelMatchUrl from './worklets/levelmatch.worklet.ts?worker&url'
import loudnessUrl from './worklets/loudness.worklet.ts?worker&url'

export interface LoopRegion {
  enabled: boolean
  start: number
  end: number
}

class Engine {
  ctx!: AudioContext
  private initPromise?: Promise<void>
  private mixIn!: GainNode
  private master!: GainNode
  private mixOut!: GainNode
  private refOut!: GainNode
  masterProbe!: LevelProbe
  private reverb!: ReverbBus
  private delay!: DelayBus
  private reverbReturn!: GainNode
  private delayReturn!: GainNode
  private loudnessNode!: AudioWorkletNode
  loudness: LoudnessReading = { momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity, truePeakDb: -Infinity }

  readonly strips = new Map<string, ChannelStrip>()
  readonly buffers = new Map<string, AudioBuffer>()
  private sources: AudioBufferSourceNode[] = []
  private refBuffer?: AudioBuffer
  private refSource?: AudioBufferSourceNode

  playing = false
  private startedAt = 0 // ctx time when playback (re)started
  private startOffset = 0
  loop: LoopRegion = { enabled: false, start: 0, end: 0 }
  listenToRef = false

  init() {
    this.initPromise ??= this.doInit()
    return this.initPromise
  }

  private async doInit() {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }))
    await Promise.all([compressorUrl, levelMatchUrl, loudnessUrl].map((u) => ctx.audioWorklet.addModule(u)))

    this.mixIn = ctx.createGain()
    this.master = ctx.createGain()
    this.mixOut = ctx.createGain()
    this.refOut = ctx.createGain()
    this.refOut.gain.value = 0
    this.masterProbe = new LevelProbe(ctx, 8192)
    this.loudnessNode = new AudioWorkletNode(ctx, 'mx-loudness', { numberOfOutputs: 0 })
    this.loudnessNode.port.onmessage = (e: MessageEvent<LoudnessReading>) => (this.loudness = e.data)

    this.reverb = new ReverbBus(ctx)
    this.delay = new DelayBus(ctx)
    this.reverbReturn = ctx.createGain()
    this.delayReturn = ctx.createGain()
    this.reverb.output.connect(this.reverbReturn).connect(this.mixIn)
    this.delay.output.connect(this.delayReturn).connect(this.mixIn)

    this.mixIn.connect(this.master).connect(this.mixOut).connect(ctx.destination)
    this.refOut.connect(ctx.destination)
    // Meters read whatever the listener hears (mix or reference).
    this.mixOut.connect(this.masterProbe.node)
    this.mixOut.connect(this.loudnessNode)
    this.refOut.connect(this.masterProbe.node)
    this.refOut.connect(this.loudnessNode)
  }

  get duration() {
    let d = 0
    for (const b of this.buffers.values()) d = Math.max(d, b.duration)
    return d
  }

  get position() {
    if (!this.playing) return this.startOffset
    let pos = this.startOffset + this.ctx.currentTime - this.startedAt
    if (this.loop.enabled && this.loop.end > this.loop.start && pos >= this.loop.end) {
      const len = this.loop.end - this.loop.start
      pos = this.loop.start + ((pos - this.loop.start) % len)
    } else if (this.duration) {
      pos = pos % this.duration
    }
    return pos
  }

  async decode(data: ArrayBuffer) {
    await this.init()
    return this.ctx.decodeAudioData(data)
  }

  setBuffer(id: string, buf: AudioBuffer) {
    this.buffers.set(id, buf)
    if (!this.strips.has(id)) {
      this.strips.set(id, new ChannelStrip(this.ctx, this.mixIn, this.reverb.input, this.delay.input))
    }
    if (this.playing) this.restart()
  }

  removeChannel(id: string) {
    this.strips.get(id)?.dispose()
    this.strips.delete(id)
    this.buffers.delete(id)
  }

  setReference(buf: AudioBuffer | undefined) {
    this.refBuffer = buf
    if (this.playing) this.restart()
  }

  get hasReference() {
    return !!this.refBuffer
  }

  setListenToRef(on: boolean) {
    this.listenToRef = on
    const t = this.ctx.currentTime
    this.mixOut.gain.setTargetAtTime(on ? 0 : 1, t, 0.01)
    this.refOut.gain.setTargetAtTime(on ? 1 : 0, t, 0.01)
    this.loudnessNode.port.postMessage({ reset: true })
  }

  /** Reference playback level, so the comparison can be made at equal loudness. */
  setRefLevelDb(db: number) {
    this.refLevel = dbToGain(db)
    if (this.refSourceGain) this.refSourceGain.gain.value = this.refLevel
  }
  private refLevel = 1
  private refSourceGain?: GainNode

  sync(mix: MixState) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const anySolo = mix.channels.some((c) => c.solo)
    for (const ch of mix.channels) {
      this.strips.get(ch.id)?.apply(ch, !ch.mute && (!anySolo || ch.solo))
    }
    this.master.gain.setTargetAtTime(dbToGain(mix.masterDb), t, 0.01)
    this.reverb.setDecay(mix.reverbDecay)
    this.reverbReturn.gain.setTargetAtTime(dbToGain(mix.reverbReturnDb), t, 0.01)
    this.delay.set(mix.bpm, mix.delayBeats, mix.delayFeedback)
    this.delayReturn.gain.setTargetAtTime(dbToGain(mix.delayReturnDb), t, 0.01)
  }

  async play(from = this.position) {
    await this.init()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.stopSources()
    const when = this.ctx.currentTime + 0.03
    const loop = this.loop.enabled && this.loop.end > this.loop.start
    for (const [id, buf] of this.buffers) {
      const strip = this.strips.get(id)
      if (!strip) continue
      this.sources.push(this.startSource(buf, strip.input, when, from, loop))
    }
    if (this.refBuffer) {
      this.refSourceGain = this.ctx.createGain()
      this.refSourceGain.gain.value = this.refLevel
      this.refSourceGain.connect(this.refOut)
      this.refSource = this.startSource(this.refBuffer, this.refSourceGain, when, from, loop)
    }
    this.startedAt = when
    this.startOffset = from
    this.playing = true
    this.loudnessNode.port.postMessage({ reset: true })
  }

  private startSource(buf: AudioBuffer, dest: AudioNode, when: number, from: number, loop: boolean) {
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    if (loop) {
      src.loop = true
      src.loopStart = this.loop.start
      src.loopEnd = Math.min(this.loop.end, buf.duration)
    } else {
      src.loop = true // whole-song loop keeps stems aligned
    }
    src.connect(dest)
    src.start(when, Math.min(from, Math.max(0, buf.duration - 0.01)))
    return src
  }

  private stopSources() {
    for (const s of this.sources) {
      try { s.stop() } catch { /* already stopped */ }
      s.disconnect()
    }
    this.sources = []
    if (this.refSource) {
      try { this.refSource.stop() } catch { /* already stopped */ }
      this.refSource.disconnect()
      this.refSourceGain?.disconnect()
      this.refSource = undefined
    }
  }

  stop() {
    this.startOffset = this.position
    this.stopSources()
    this.playing = false
  }

  seek(t: number) {
    this.startOffset = Math.max(0, t)
    if (this.playing) this.play(this.startOffset)
  }

  setLoop(loop: LoopRegion) {
    this.loop = loop
    if (this.playing) this.restart()
  }

  private restart() {
    this.play(this.position)
  }
}

export const engine = new Engine()
