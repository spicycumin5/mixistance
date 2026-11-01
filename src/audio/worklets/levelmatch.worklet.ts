/// <reference path="./worklet-env.d.ts" />
// Input 0: processed signal. Input 1: unprocessed reference.
// When enabled, scales input 0 so its long-term RMS matches input 1, so A/B
// comparisons are not biased by "louder sounds better".

class LevelMatchProcessor extends AudioWorkletProcessor {
  private enabled = true
  private procPow = 1e-6
  private refPow = 1e-6
  private gain = 1
  private powCoef = Math.exp(-1 / (1.5 * sampleRate))
  private gainCoef = Math.exp(-1 / (0.3 * sampleRate))

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ enabled?: boolean }>) => {
      if (e.data.enabled !== undefined) this.enabled = e.data.enabled
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const proc = inputs[0]
    const ref = inputs[1]
    const out = outputs[0]
    if (!proc.length) return true
    const n = proc[0].length
    for (let i = 0; i < n; i++) {
      let p = 0
      let r = 0
      for (const ch of proc) p += ch[i] * ch[i]
      if (ref?.length) for (const ch of ref) r += ch[i] * ch[i]
      this.procPow = this.powCoef * this.procPow + (1 - this.powCoef) * p
      this.refPow = this.powCoef * this.refPow + (1 - this.powCoef) * r
      let target = 1
      if (this.enabled && this.procPow > 1e-8 && this.refPow > 1e-8) {
        target = Math.min(16, Math.max(1 / 16, Math.sqrt(this.refPow / this.procPow)))
      }
      this.gain = this.gainCoef * this.gain + (1 - this.gainCoef) * target
      for (let c = 0; c < out.length; c++) out[c][i] = (proc[c] ?? proc[0])[i] * this.gain
    }
    return true
  }
}

registerProcessor('mx-levelmatch', LevelMatchProcessor)
