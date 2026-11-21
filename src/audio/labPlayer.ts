// Plays the buffers a processor lab rendered: Dry, Processed and Delta, all looping in
// sync, so switching between them keeps your place.

import { drillPlayer } from './drillPlayer'
import { engine } from './engine'

export type LabMode = 'dry' | 'wet' | 'delta'
const MODES: LabMode[] = ['dry', 'wet', 'delta']

interface Voice { src: AudioBufferSourceNode; gain: GainNode; mode: LabMode }

function toBuffer(data: Float32Array, fs: number) {
  const b = new AudioBuffer({ length: data.length, sampleRate: fs, numberOfChannels: 1 })
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  return b
}

class LabPlayer {
  private out?: GainNode
  private voices: Voice[] = []
  private buffers?: Record<LabMode, AudioBuffer>
  private levels: Record<LabMode, number> = { dry: 1, wet: 1, delta: 1 }
  private startedAt = 0
  private duration = 1
  mode: LabMode = 'wet'
  playing = false
  volumeDb = -6

  private async ensure() {
    await engine.init()
    const ctx = engine.ctx
    if (ctx.state === 'suspended') await ctx.resume()
    if (!this.out) {
      this.out = ctx.createGain()
      this.out.gain.value = Math.pow(10, this.volumeDb / 20)
      this.out.connect(ctx.destination)
    }
  }

  /** Swap in a new render. `levels` are linear gains per mode (for loudness matching). */
  setBuffers(data: Record<LabMode, Float32Array>, fs: number, levels: Record<LabMode, number>) {
    this.buffers = { dry: toBuffer(data.dry, fs), wet: toBuffer(data.wet, fs), delta: toBuffer(data.delta, fs) }
    this.levels = levels
    const pos = this.position()
    this.duration = data.dry.length / fs
    if (this.playing) this.start(pos ?? 0)
  }

  setMode(m: LabMode) {
    this.mode = m
    if (!engine.ctx) return
    const t = engine.ctx.currentTime
    for (const v of this.voices) v.gain.gain.setTargetAtTime(v.mode === m ? this.levels[v.mode] : 0, t, 0.01)
  }

  /** Position in the loop (seconds) while playing. */
  position(): number | null {
    if (!this.playing || !engine.ctx) return null
    return (engine.ctx.currentTime - this.startedAt) % this.duration
  }

  private start(offset: number) {
    const ctx = engine.ctx
    if (!this.buffers || !this.out) return
    const t = ctx.currentTime
    const off = offset % this.duration
    for (const v of this.voices) {
      v.gain.gain.setTargetAtTime(0, t, 0.008)
      v.src.stop(t + 0.05)
    }
    this.voices = MODES.map((mode) => {
      const src = ctx.createBufferSource()
      src.buffer = this.buffers![mode]
      src.loop = true
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.gain.setTargetAtTime(mode === this.mode ? this.levels[mode] : 0, t, 0.008)
      src.connect(gain).connect(this.out!)
      src.start(t, off)
      return { src, gain, mode }
    })
    this.startedAt = t - off
  }

  async play() {
    await this.ensure()
    if (engine.playing) engine.stop()
    drillPlayer.stop()
    this.playing = true
    this.start(0)
  }

  stop() {
    const t = engine.ctx?.currentTime ?? 0
    for (const v of this.voices) {
      v.gain.gain.setTargetAtTime(0, t, 0.008)
      try { v.src.stop(t + 0.05) } catch { /* not started */ }
    }
    this.voices = []
    this.playing = false
  }
}

export const labPlayer = new LabPlayer()
