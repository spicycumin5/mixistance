import { describe, expect, it } from 'vitest'
import { DEFAULT_EQ } from '../../dsp/biquad'
import { FREQ_ID_LEVELS, makeCompQuestion, makeEqTarget, makeFreqIdQuestion, scoreEqMatch, scoreFreqId } from '.'

describe('frequency ID', () => {
  it('always includes the answer among the options', () => {
    for (const level of FREQ_ID_LEVELS) {
      for (let i = 0; i < 200; i++) {
        const q = makeFreqIdQuestion(level)
        expect(q.options).toContain(q.answer)
        if (level.window) expect(q.options).toHaveLength(level.window)
      }
    }
  })
  it('gives partial credit to neighbours', () => {
    const oct = FREQ_ID_LEVELS[0]
    expect(scoreFreqId(oct, 4, 4)).toBe(1)
    expect(scoreFreqId(oct, 4, 5)).toBe(0.25)
    expect(scoreFreqId(oct, 4, 7)).toBe(0)
    const third = FREQ_ID_LEVELS[3]
    expect(scoreFreqId(third, 10, 11)).toBe(0.5)
  })
})

describe('compression questions', () => {
  it('marks the correct path', () => {
    for (let i = 0; i < 50; i++) {
      const q = makeCompQuestion(['which', 'attack', 'ratio'])
      const target = q.answer === 0 ? q.a : q.b
      const other = q.answer === 0 ? q.b : q.a
      if (q.kind === 'which') { expect(target).not.toBeNull(); expect(other).toBeNull() }
      if (q.kind === 'attack') expect(target!.attackMs).toBeGreaterThan(other!.attackMs)
      if (q.kind === 'ratio') expect(target!.ratio).toBeGreaterThan(other!.ratio)
    }
  })
})

describe('EQ match', () => {
  it('perfect match scores 1, flat vs target scores lower', () => {
    const t = makeEqTarget(2)
    expect(scoreEqMatch(t, t).score).toBe(1)
    expect(scoreEqMatch(DEFAULT_EQ, t).score).toBeLessThan(1)
  })
})
