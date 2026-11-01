import { useEffect, useState } from 'react'
import { drillPlayer, type DrillSource } from '../../audio/drillPlayer'
import { DEFAULT_EQ } from '../../dsp/biquad'
import { FREQ_ID_LEVELS, makeFreqIdQuestion, scoreFreqId, type FreqIdQuestion } from '../../training/drills'
import { drillStats, recordDrill } from '../../training/progress'
import { fmtHz } from '../format'
import { DrillTransport, StatsBar, useDrillStats, Verdict } from './DrillShell'

// What each region typically sounds like, the vocabulary engineers use.
const CHARACTER: [number, string][] = [
  [80, 'sub / weight: felt more than heard'],
  [180, 'bass / warmth: fullness, boom'],
  [350, 'low-mids: mud, boxiness'],
  [700, 'mids: honk, "telephone" body'],
  [1500, 'upper-mids: nasal, push'],
  [3500, 'presence: bite, harshness, intelligibility'],
  [7000, 'brilliance: sibilance, crispness'],
  [20000, 'air: sheen, openness'],
]
const describe = (f: number) => CHARACTER.find(([hi]) => f <= hi)?.[1] ?? ''

export function FreqIdDrill() {
  const [levelId, setLevelId] = useState(FREQ_ID_LEVELS[0].id)
  const level = FREQ_ID_LEVELS.find((l) => l.id === levelId)!
  const [source, setSource] = useState<DrillSource>('pink')
  const [q, setQ] = useState<FreqIdQuestion>(() => makeFreqIdQuestion(level))
  const [guess, setGuess] = useState<number | null>(null)
  const [stats, setStats] = useDrillStats(`freq-${levelId}`)

  useEffect(() => { drillPlayer.setSource(source) }, [source])
  useEffect(() => {
    // Path A = flat, path B = the hidden EQ move.
    const flat = DEFAULT_EQ.map((b) => ({ ...b, enabled: false }))
    drillPlayer.setPaths([{ kind: 'dry' }, { kind: 'eq', bands: [...flat.slice(0, 2), q.band, ...flat.slice(3)] }], false)
    drillPlayer.select(1)
  }, [q])

  const next = (lv = level) => { setQ(makeFreqIdQuestion(lv)); setGuess(null) }
  const answer = (i: number) => {
    if (guess !== null) return
    setGuess(i)
    setStats(recordDrill(`freq-${levelId}`, scoreFreqId(level, q.answer, i)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FREQ_ID_LEVELS.map((l) => (
          <button
            key={l.id}
            className={`btn !text-xs ${l.id === levelId ? '!border-amber !text-amber' : ''}`}
            title={l.description}
            onClick={() => { setLevelId(l.id); next(l); setStats(drillStats(`freq-${l.id}`)) }}
          >{l.label}</button>
        ))}
      </div>
      <p className="text-sm text-dim">{level.description} <b className="text-ink">A</b> is flat, <b className="text-ink">B</b> has a hidden {level.gainDb > 0 ? 'boost' : 'cut'}. Which frequency?</p>
      <DrillTransport sources={['pink', 'mix', 'drums', 'vox', 'keys']} source={source} onSource={setSource} labels={['A: flat', 'B: EQ’d']} />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(q.options.length, 9)}, minmax(0, 1fr))` }}>
        {q.options.map((i) => {
          const f = level.bands[i]
          const state = guess === null ? '' : i === q.answer ? '!border-good !bg-good/20' : i === guess ? '!border-bad !bg-bad/20' : 'opacity-50'
          return (
            <button key={i} className={`btn readout !py-3 text-base ${state}`} onClick={() => answer(i)}>{fmtHz(f)}</button>
          )
        })}
      </div>
      {guess !== null && (
        <Verdict score={scoreFreqId(level, q.answer, guess)}>
          It was <b className="readout">{fmtHz(level.bands[q.answer])} Hz</b>, in the <i>{describe(level.bands[q.answer])}</i> region.
          {guess !== q.answer && <> You picked {fmtHz(level.bands[guess])} Hz ({describe(level.bands[guess])}). Toggle A/B again now that you know the answer, to lock in what that region sounds like.</>}
          <div className="mt-2"><button className="btn btn-primary" onClick={() => next()}>Next →</button></div>
        </Verdict>
      )}
      <StatsBar stats={stats} />
    </div>
  )
}
