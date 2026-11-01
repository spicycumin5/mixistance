import { useState } from 'react'
import { getMixFeedback, type MixFeedback, type Suggestion } from '../ai/feedbackClient'
import { resetSnapshot } from '../ai/snapshot'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import type { ChannelState } from '../state/types'
import { usePolled } from './hooks'

const SEV = { high: 'bg-bad text-black', medium: 'bg-warn text-black', low: 'bg-panel-3 text-dim' }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function applySuggestion(s: Suggestion): ChannelState | undefined {
  const st = useStore.getState()
  const before = st.mix.channels.find((c) => c.id === s.channelId)
  if (!before) return
  const id = s.channelId
  switch (s.action) {
    case 'fader': if (s.value !== null) st.setChannel(id, { faderDb: clamp(s.value, -60, 6) }); break
    case 'pan': if (s.value !== null) st.setChannel(id, { pan: clamp(s.value, -1, 1) }); break
    case 'reverb_send': if (s.value !== null) st.setChannel(id, { reverbSendDb: clamp(s.value, -60, 0) }); break
    case 'delay_send': if (s.value !== null) st.setChannel(id, { delaySendDb: clamp(s.value, -60, 0) }); break
    case 'eq_band': {
      if (s.bandIndex === null || s.bandIndex < 0 || s.bandIndex > 5) return
      st.setChannel(id, { eqOn: true })
      st.setEqBand(id, s.bandIndex, {
        enabled: true,
        ...(s.freq !== null && { freq: clamp(s.freq, 20, 20000) }),
        ...(s.gainDb !== null && { gainDb: clamp(s.gainDb, -18, 18) }),
        ...(s.q !== null && { q: clamp(s.q, 0.3, 10) }),
      })
      break
    }
    case 'compressor':
      st.setChannel(id, { compOn: true })
      st.setComp(id, {
        ...(s.thresholdDb !== null && { thresholdDb: clamp(s.thresholdDb, -60, 0) }),
        ...(s.ratio !== null && { ratio: clamp(s.ratio, 1, 20) }),
        ...(s.attackMs !== null && { attackMs: clamp(s.attackMs, 0.1, 150) }),
        ...(s.releaseMs !== null && { releaseMs: clamp(s.releaseMs, 10, 2000) }),
      })
      break
  }
  st.select(id)
  return before
}

function SuggestionCard({ s }: { s: Suggestion }) {
  const [undo, setUndo] = useState<ChannelState>()
  const name = useStore((st) => st.mix.channels.find((c) => c.id === s.channelId)?.name ?? s.channelId)
  return (
    <div className="rounded-md border border-line bg-panel-2 p-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider text-dim">{name}</div>
          <div className="text-sm font-medium">{s.title}</div>
        </div>
        {undo ? (
          <button className="btn !px-2 !py-1 !text-xs" onClick={() => { useStore.getState().setChannel(undo.id, undo); setUndo(undefined) }}>Undo</button>
        ) : (
          <button className="btn btn-primary !px-2 !py-1 !text-xs" onClick={() => setUndo(applySuggestion(s))}>Try it</button>
        )}
      </div>
      <p className="mt-1 text-xs text-dim">{s.rationale}</p>
    </div>
  )
}

export function CoachPanel() {
  const [goal, setGoal] = useState('')
  const [state, setState] = useState<{ loading: boolean; fb?: MixFeedback; error?: string }>({ loading: false })
  const playing = usePolled(() => engine.playing, 200)
  const hasChannels = useStore((s) => s.mix.channels.length > 0)

  const run = async () => {
    setState({ loading: true })
    try {
      setState({ loading: false, fb: await getMixFeedback(goal) })
    } catch (e) {
      setState({ loading: false, error: (e as Error).message })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-dim">
        Play at least 10-20 seconds of your mix first. The coach looks at your settings plus the spectrum and dynamics measured during playback (numbers only, no audio leaves your browser).
      </p>
      <input
        className="rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm outline-none focus:border-amber"
        placeholder="Goal or reference (optional), e.g. 'modern pop, vocal-forward'"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={state.loading || !hasChannels} onClick={run}>
          {state.loading ? 'Listening…' : '✦ Get mix feedback'}
        </button>
        <button className="btn" onClick={resetSnapshot} title="Clear accumulated analysis, e.g. after big changes">Reset analysis</button>
      </div>
      {!playing && !state.fb && <p className="text-[11px] text-warn">Tip: press Play so the analyzer collects data.</p>}
      {state.error && <div className="rounded-md border border-bad/40 bg-bad/10 p-2 text-xs text-bad">{state.error}</div>}

      {state.fb && (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed">{state.fb.overall}</p>
          {state.fb.strengths.length > 0 && (
            <div>
              <h4 className="mb-1 text-[11px] uppercase tracking-wider text-good">Working well</h4>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink/80">{state.fb.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <h4 className="text-[11px] uppercase tracking-wider text-dim">Issues</h4>
            {state.fb.issues.map((iss, i) => (
              <div key={i} className="rounded-md border border-line p-2">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className={`chip ${SEV[iss.severity]}`}>{iss.severity}</span>
                  <span className="text-xs font-semibold">{iss.area}</span>
                </div>
                <p className="text-xs">{iss.problem}</p>
                <p className="mt-1 text-xs text-amber">→ {iss.fix}</p>
              </div>
            ))}
          </div>
          {state.fb.suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[11px] uppercase tracking-wider text-dim">Suggested moves: try each one and listen</h4>
              {state.fb.suggestions.map((s, i) => <SuggestionCard key={i} s={s} />)}
            </div>
          )}
          <div className="rounded-md border border-violet-400/30 bg-violet-400/5 p-2 text-xs">
            <span className="font-semibold text-violet-300">Practise next: </span>{state.fb.nextFocus}
          </div>
        </div>
      )}
    </div>
  )
}
