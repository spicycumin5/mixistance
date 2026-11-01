/// <reference path="./worklet-env.d.ts" />
import { CompressorCore, type CompressorParams } from '../../dsp/compressorCore'

class CompressorProcessor extends AudioWorkletProcessor {
  private core = new CompressorCore(sampleRate)
  private bypass = false
  private frames = 0
  private reportEvery = Math.round(sampleRate / 30)

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ params?: Partial<CompressorParams>; bypass?: boolean }>) => {
      if (e.data.params) this.core.set(e.data.params)
      if (e.data.bypass !== undefined) this.bypass = e.data.bypass
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input.length) return true
    for (let c = 0; c < output.length; c++) output[c].set(input[c] ?? input[0])
    if (!this.bypass) this.core.process(output)
    this.frames += output[0].length
    if (this.frames >= this.reportEvery) {
      this.frames = 0
      this.port.postMessage({ gr: this.bypass ? 0 : this.core.readGr() })
    }
    return true
  }
}

registerProcessor('mx-compressor', CompressorProcessor)
