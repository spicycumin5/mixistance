/// <reference path="./worklet-env.d.ts" />
import { LoudnessMeter } from '../../dsp/loudness'

class LoudnessProcessor extends AudioWorkletProcessor {
  private meter = new LoudnessMeter(sampleRate, 2)
  private frames = 0
  private reportEvery = Math.round(sampleRate / 10)

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<{ reset?: boolean }>) => {
      if (e.data.reset) this.meter.reset()
    }
  }

  process(inputs: Float32Array[][]) {
    const input = inputs[0]
    if (!input.length) return true
    this.meter.process(input)
    this.frames += input[0].length
    if (this.frames >= this.reportEvery) {
      this.frames = 0
      this.port.postMessage(this.meter.read())
    }
    return true
  }
}

registerProcessor('mx-loudness', LoudnessProcessor)
