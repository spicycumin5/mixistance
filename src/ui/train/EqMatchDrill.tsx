import { useEffect, useState } from 'react'
import { drillPlayer, type DrillSource } from '../../audio/drillPlayer'
import { DEFAULT_EQ, type EqBand } from '../../dsp/biquad'
import { makeEqTarget, scoreEqMatch } from '../../training/drills'
import { drillStats, recordDrill } from '../../training/progress'
import { EQPanel } from '../plugins/EQPanel'
import { DrillTransport, StatsBar, useDrillStats, Verdict } from './DrillShell'

const flat = () => DEFAULT_EQ.map((b) => ({ ...b }))

export function EqMatchDrill() {
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1)
  const [source, setSource] = useState<DrillSource>('pink')
  const [target, setTarget] = useState(() => makeEqTarget(1))
  const [mine, setMine] = useState<EqBand[]>(flat)
  const [result, setResult] = useState<{ dist: number; score: number } | null>(null)
  const [stats, setStats] = useDrillStats(`eqmatch-${difficulty}`)

  useEffect(() => { drillPlayer.setSource(source) }, [source])
  useEffect(() => {
    // No level matching: EQ match is about tone *and* level.
    drillPlayer.setPaths([{ kind: 'eq', bands: target }, { kind: 'eq', bands: mine }], false)
    drillPlayer.select(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  useEffect(() => { drillPlayer.updateEq(1, mine) }, [mine])

  const next = (d = difficulty) => { setTarget(makeEqTarget(d)); setMine(flat()); setResult(null) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((d) => (
          <button key={d} className={`btn !text-xs ${d === difficulty ? '!border-amber !text-amber' : ''}`}
            onClick={() => { setDifficulty(d); next(d); setStats(drillStats(`eqmatch-${d}`)) }}>
            {d === 1 ? '1 band, wide' : d === 2 ? '2 bands' : '3 bands'}
          </button>
        ))}
      </div>
      <p className="text-sm text-dim">
        <b className="text-ink">Target</b> has a hidden EQ. Shape <b className="text-ink">Yours</b> until switching between them sounds identical. Work the biggest difference first: is it bass, mids, or top?
      </p>
      <DrillTransport sources={['pink', 'mix', 'vox', 'drums', 'keys']} source={source} onSource={setSource} labels={['Target', 'Yours']} />
      <EQPanel
        bands={mine}
        onBand={(i, p) => { if (!result) { setMine((m) => m.map((b, j) => (j === i ? { ...b, ...p } : b))); drillPlayer.select(1) } }}
        ghost={result ? target : undefined}
        height={200}
      />
      {!result ? (
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => { const r = scoreEqMatch(mine, target); setResult(r); setStats(recordDrill(`eqmatch-${difficulty}`, r.score)) }}>Submit match</button>
          <button className="btn" onClick={() => setMine(flat())}>Reset my EQ</button>
        </div>
      ) : (
        <Verdict score={result.score}>
          Your curve is <b className="readout">{result.dist.toFixed(1)} dB</b> RMS from the target (the green dashed line).
          {result.dist <= 1 ? ' That is a match by ear.' : result.dist <= 3 ? ' Close. Compare the curves and listen to the region where they differ most.' : ' Look at where the curves diverge, then A/B again to hear that region.'}
          <div className="mt-2"><button className="btn btn-primary" onClick={() => next()}>Next →</button></div>
        </Verdict>
      )}
      <StatsBar stats={stats} />
    </div>
  )
}
