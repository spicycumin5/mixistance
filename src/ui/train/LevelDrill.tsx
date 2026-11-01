import { useEffect, useState } from 'react'
import { drillPlayer, type DrillSource } from '../../audio/drillPlayer'
import { LEVEL_STEPS, makeLevelQuestion } from '../../training/drills'
import { drillStats, recordDrill } from '../../training/progress'
import { DrillTransport, StatsBar, useDrillStats, Verdict } from './DrillShell'

export function LevelDrill() {
  const [step, setStep] = useState(LEVEL_STEPS[0])
  const [source, setSource] = useState<DrillSource>('mix')
  const [q, setQ] = useState(() => makeLevelQuestion(step))
  const [guess, setGuess] = useState<0 | 1 | null>(null)
  const [stats, setStats] = useDrillStats(`level-${step}`)

  useEffect(() => { drillPlayer.setSource(source) }, [source])
  useEffect(() => {
    drillPlayer.setPaths(q.gainsDb.map((db) => ({ kind: 'gain' as const, db: db - step })), false)
    drillPlayer.select(0)
  }, [q, step])

  const next = (s = step) => { setQ(makeLevelQuestion(s)); setGuess(null) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {LEVEL_STEPS.map((s) => (
          <button key={s} className={`btn readout !text-xs ${s === step ? '!border-amber !text-amber' : ''}`}
            onClick={() => { setStep(s); next(s); setStats(drillStats(`level-${s}`)) }}>{s} dB</button>
        ))}
      </div>
      <p className="text-sm text-dim">
        One side is {step} dB louder. Why this matters: louder almost always sounds "better", so if you cannot spot a 1 dB change you will be fooled by your own EQ and compression moves. Pros level-match every A/B.
      </p>
      <DrillTransport sources={['mix', 'pink', 'vox', 'drums']} source={source} onSource={setSource} />
      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as const).map((i) => {
          const state = guess === null ? '' : i === q.answer ? '!border-good !bg-good/20' : i === guess ? '!border-bad !bg-bad/20' : 'opacity-50'
          return (
            <button key={i} className={`btn !py-3 text-base ${state}`} onClick={() => {
              if (guess !== null) return
              setGuess(i)
              setStats(recordDrill(`level-${step}`, i === q.answer ? 1 : 0))
            }}>{i === 0 ? 'A' : 'B'} is louder</button>
          )
        })}
      </div>
      {guess !== null && (
        <Verdict score={guess === q.answer ? 1 : 0}>
          {q.answer === 0 ? 'A' : 'B'} was {step} dB louder.
          <div className="mt-2"><button className="btn btn-primary" onClick={() => next()}>Next →</button></div>
        </Verdict>
      )}
      <StatsBar stats={stats} />
    </div>
  )
}
