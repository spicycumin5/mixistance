// Lookahead brickwall peak limiter, rendered offline over a looping buffer.
//
// For every sample we need gain g_req = min(1, ceiling / |x|). Holding the minimum of
// g_req over the next L samples and then box-averaging over L samples gives a smooth
// attack ramp that is guaranteed to be at or below g_req when the peak arrives.
// The output is delayed by L samples (the lookahead). Here we compensate for that delay,
// so the output lines up with the input on screen.

import { fromDb, timeCoef } from './compressorCore'

export interface LimiterParams {
  inputDb: number
  ceilingDb: number
  releaseMs: number
  lookaheadMs: number
}

export const DEFAULT_LIMITER: LimiterParams = { inputDb: 6, ceilingDb: -1, releaseMs: 80, lookaheadMs: 5 }

export interface LimiterRender {
  out: Float32Array
  gainDb: Float32Array
}

export function renderLimiter(input: Float32Array, fs: number, p: LimiterParams): LimiterRender {
  const n = input.length
  const drive = fromDb(p.inputDb)
  const ceil = fromDb(p.ceilingDb)
  const L = Math.max(0, Math.round((p.lookaheadMs / 1000) * fs))
  const at = (i: number) => ((i % n) + n) % n

  // Required gain per sample (circular, since the buffer loops).
  const req = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.abs(input[i]) * drive
    req[i] = a > ceil ? ceil / a : 1
  }

  // Forward-looking min over [i, i+L], via a monotonic deque over a doubled index range.
  const hold = new Float32Array(n)
  const dq: number[] = []
  let head = 0
  for (let j = n + L - 1; j >= 0; j--) {
    const v = req[at(j)]
    while (dq.length > head && req[at(dq[dq.length - 1])] >= v) dq.pop()
    dq.push(j)
    while (dq[head] > j + L) head++
    if (j < n) hold[j] = req[at(dq[head])]
  }

  // Gain for x[i] = mean of hold[i-L .. i]. Each of those windows contains sample i, so
  // every value is <= req[i], and so is their mean. The ramp down spans the L samples
  // before the peak, which is what the lookahead buys.
  const smooth = new Float32Array(n)
  if (L === 0) smooth.set(hold)
  else {
    let sum = 0
    for (let k = 0; k <= L; k++) sum += hold[at(k - L)]
    for (let i = 0; i < n; i++) {
      smooth[i] = sum / (L + 1)
      sum += hold[at(i + 1)] - hold[at(i - L)]
    }
  }

  // Release: gain may fall instantly, but recovers with a one-pole curve. Run twice so
  // the loop start sees the state from the loop end.
  const r = timeCoef(p.releaseMs, fs)
  const gain = new Float32Array(n)
  let g = 1
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const t = smooth[i]
      g = t <= g ? t : r * g + (1 - r) * t
      gain[i] = g
    }
  }

  const out = new Float32Array(n)
  const gainDb = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = input[i] * drive * gain[i]
    gainDb[i] = 20 * Math.log10(Math.max(gain[i], 1e-9))
  }
  return { out, gainDb }
}
