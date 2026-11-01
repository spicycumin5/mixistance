import type { EqBand } from '../dsp/biquad'
import type { CompressorParams } from '../dsp/compressorCore'

export interface ChannelState {
  id: string
  name: string
  color: string
  gainDb: number // input trim
  pan: number // -1..1
  faderDb: number
  mute: boolean
  solo: boolean
  eq: EqBand[]
  eqOn: boolean
  comp: CompressorParams
  compOn: boolean
  reverbSendDb: number // -60 = off
  delaySendDb: number
}

export interface MixState {
  bpm: number
  channels: ChannelState[]
  masterDb: number
  reverbDecay: number // seconds
  reverbReturnDb: number
  delayBeats: number
  delayFeedback: number
  delayReturnDb: number
}

export const SEND_OFF_DB = -60
