import { useEffect, useState } from 'react'
import { drillPlayer, type DrillSource } from '../../audio/drillPlayer'
import { makeCompQuestion, type CompQuestion, type CompQuestionKind } from '../../training/drills'
import { drillStats, recordDrill } from '../../training/progress'
import { DrillTransport, StatsBar, useDrillStats, Verdict } from './DrillShell'

const MODES: { id: string; label: string; kinds: CompQuestionKind[] }[] = [
  { id: 'which', label: 'Compressed or not?', kinds: ['which'] },
  { id: 'attack', label: 'Fast vs slow attack', kinds: ['attack'] },
  { id: 'ratio', label: 'Light vs heavy ratio', kinds: ['ratio'] },
  { id: 'mixed', label: 'Mixed', kinds: ['which', 'attack', 'ratio'] },
]

const describe = (p: CompQuestion['a']) =>
  p ? `${p.ratio}:1, attack ${p.attackMs} ms, release ${p.releaseMs} ms` : 'uncompressed'

export function CompDrill() {
  const [modeId, setModeId] = useState('which')
  const mode = MODES.find((m) => m.id === modeId)!
  const [source, setSource] = useState<DrillSource>('drums')
  const [q, setQ] = useState(() => makeCompQuestion(mode.kinds))
  const [guess, setGuess] = useState<0 | 1 | null>(null)
  const [stats, setStats] = useDrillStats(`comp-${modeId}`)

  useEffect(() => { drillPlayer.setSource(source) }, [source])
  useEffect(() => {
    // Compressed paths are loudness-matched to the dry signal, so level gives nothing away.
    const spec = (p: CompQuestion['a']) => (p ? { kind: 'comp' as const, params: p } : { kind: 'dry' as const })
    drillPlayer.setPaths([spec(q.a), spec(q.b)], true)
    drillPlayer.select(0)
  }, [q])

  const next = (m = mode) => { setQ(makeCompQuestion(m.kinds)); setGuess(null) }
  const answer = (i: 0 | 1) => {
    if (guess !== null) return
    setGuess(i)
    setStats(recordDrill(`comp-${modeId}`, i === q.answer ? 1 : 0))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.id} className={`btn !text-xs ${m.id === modeId ? '!border-amber !text-amber' : ''}`}
            onClick={() => { setModeId(m.id); next(m); setStats(drillStats(`comp-${m.id}`)) }}>{m.label}</button>
        ))}
      </div>
      <p className="text-sm">{q.prompt}</p>
      <DrillTransport sources={['drums', 'vox', 'bass', 'mix']} source={source} onSource={setSource} />
      <div className="grid grid-cols-2 gap-2">
        {([0, 1] as const).map((i) => {
          const state = guess === null ? '' : i === q.answer ? '!border-good !bg-good/20' : i === guess ? '!border-bad !bg-bad/20' : 'opacity-50'
          return <button key={i} className={`btn !py-3 text-base ${state}`} onClick={() => answer(i)}>{i === 0 ? 'A' : 'B'}</button>
        })}
      </div>
      {guess !== null && (
        <Verdict score={guess === q.answer ? 1 : 0}>
          <p className="mb-1">A: {describe(q.a)} · B: {describe(q.b)}</p>
          <p className="text-ink/80">{q.explain}</p>
          <div className="mt-2"><button className="btn btn-primary" onClick={() => next()}>Next →</button></div>
        </Verdict>
      )}
      <StatsBar stats={stats} />
    </div>
  )
}
