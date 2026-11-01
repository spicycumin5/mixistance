// Minimal AudioWorkletGlobalScope typings.
declare const sampleRate: number
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor()
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void
