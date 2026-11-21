// A processor lab renders a test signal through pure DSP and describes what to draw.
// The UI is generic: every lab produces the same LabRender shape.

import type { LabSource } from '../audio/sources'

export type Params = Record<string, number | string>

interface ParamBase {
  key: string
  label: string
  /** One-sentence definition. */
  what: string
  /** What changes in the sound. */
  hear: string
  /** What to watch on the graphs. */
  see: string
  /** Typical settings and starting points. */
  typical: string
  /** Graph elements tagged with this key are emphasised while the knob is hovered or dragged. */
  highlight?: string
}

export interface NumParam extends ParamBase {
  kind?: 'num'
  min: number
  max: number
  default: number
  log?: boolean
  step?: number
  format?: (v: number) => string
}

export interface ChoiceParam extends ParamBase {
  kind: 'choice'
  options: { value: string; label: string }[]
  default: string
}

export type ParamDef = NumParam | ChoiceParam

/** Horizontal level marker on the waveform (dBFS). */
export interface LevelLine { db: number; label: string; color?: string; highlight?: string }
/** Time span (seconds) shaded on the waveform while its highlight is active. */
export interface Zone { t0: number; t1: number; highlight: string }

/** A time-aligned trace under the waveform. */
export interface Lane {
  label: string
  /** 'gain': dB trace drawn downward from 0. 'wave': an extra signal. */
  kind: 'gain' | 'wave'
  data: Float32Array
  color?: string
  highlight?: string
  /** Fixed depth of a gain lane in dB (auto when omitted). */
  rangeDb?: number
}

export interface CurveLine {
  fn: (x: number) => number
  color: string
  width?: number
  dash?: number[]
  label?: string
  highlight?: string
  /** Only draw while the highlight is active. */
  onlyActive?: boolean
  from?: number
  to?: number
}

export interface CurveSpec {
  title: string
  unit: 'dB' | 'lin'
  lo: number
  hi: number
  xLabel: string
  yLabel: string
  lines: CurveLine[]
  vlines?: { x: number; label: string; highlight?: string }[]
  hlines?: { y: number; label: string; highlight?: string }[]
  zones?: { x0: number; x1: number; highlight: string }[]
}

export interface SpectrumSpec {
  title: string
  binHz: number
  dry: Float32Array
  wet: Float32Array
  /** Fractional-octave smoothing for broadband sources. Off shows single harmonics. */
  smooth: boolean
  markers?: { freq: number; label: string; highlight?: string }[]
  /** Gain curves drawn on their own 0 to -36 dB scale. */
  overlays?: { fn: (f: number) => number; color: string; label: string; highlight?: string }[]
}

export interface IrSpec {
  data: Float32Array
  fs: number
  regions: { t0: number; t1: number; label: string; color: string; highlight?: string }[]
  /** Energy envelopes (dB, one value per block). */
  envelopes: { data: Float32Array; blockSec: number; color: string; label: string; highlight?: string }[]
  markers: { t: number; label: string; highlight?: string }[]
}

export interface LabRender {
  fs: number
  /** What you hear. Dry and wet must have the same length. */
  audio: { dry: Float32Array; wet: Float32Array }
  /** What the main waveform draws, if different from the audio (e.g. sidechain shows only the ducked track). */
  show?: { dry: Float32Array; wet: Float32Array; label?: string }
  levelLines?: LevelLine[]
  zones?: Zone[]
  lanes?: Lane[]
  curve?: CurveSpec
  spectrum?: SpectrumSpec
  ir?: IrSpec
}

export interface TourStep<P extends Params = Params> {
  text: string
  /** "Set it for me" applies these. */
  set?: Partial<P>
  source?: LabSource
  check?: (p: P, source: LabSource) => boolean
}

export interface RenderCtx { fs: number; source: LabSource }

export interface LabDef<P extends Params = Params> {
  id: string
  title: string
  tag: 'Dynamics' | 'Tone' | 'Space' | 'Technique'
  blurb: string
  /** Plain-language explanation shown above the lab. Supports **bold** and "- " bullets. */
  concept: string
  sources: LabSource[]
  defaultScale?: 'lin' | 'db'
  params: ParamDef[]
  render: (src: Float32Array, p: P, ctx: RenderCtx) => LabRender | Promise<LabRender>
  tour: TourStep<P>[]
}

export const defaultsOf = (lab: LabDef<any>): Params =>
  Object.fromEntries(lab.params.map((p) => [p.key, p.default]))
