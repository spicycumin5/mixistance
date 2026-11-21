// Minimal in-place radix-2 FFT and an averaged magnitude spectrum.

export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

/**
 * Average power spectrum over Hann-windowed frames, in dB (0 dB = full-scale sine).
 * Returns n/2 bins with spacing fs/n.
 */
export function averageSpectrumDb(x: Float32Array, n = 4096, maxFrames = 64): Float32Array {
  const hop = Math.max(n / 2, Math.floor((x.length - n) / maxFrames))
  const win = new Float64Array(n)
  let wsum = 0
  for (let i = 0; i < n; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); wsum += win[i] }
  const pow = new Float64Array(n / 2)
  let frames = 0
  const re = new Float64Array(n), im = new Float64Array(n)
  for (let s = 0; s + n <= x.length; s += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[s + i] * win[i]; im[i] = 0 }
    fft(re, im)
    for (let k = 0; k < n / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k]
    frames++
  }
  const out = new Float32Array(n / 2)
  const norm = (wsum / 2) ** 2 * Math.max(frames, 1)
  for (let k = 0; k < n / 2; k++) out[k] = 10 * Math.log10(pow[k] / norm + 1e-14)
  return out
}

/** Level (dB) of the k-th harmonic of f0, read as the peak bin near k·f0. */
export function harmonicLevels(specDb: Float32Array, binHz: number, f0: number, count: number): number[] {
  const out: number[] = []
  for (let h = 1; h <= count; h++) {
    const c = Math.round((h * f0) / binHz)
    let m = -300
    for (let k = Math.max(0, c - 2); k <= Math.min(specDb.length - 1, c + 2); k++) m = Math.max(m, specDb[k])
    out.push(m)
  }
  return out
}
