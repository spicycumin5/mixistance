import { useEffect, useState } from 'react'
import { startSnapshotCollector } from './ai/snapshot'
import { engine } from './audio/engine'
import { labPlayer } from './audio/labPlayer'
import { useLabNav } from './lab/nav'
import { useStore } from './state/store'
import { CoachPanel } from './ui/CoachPanel'
import { LearnView } from './ui/learn/LearnView'
import { LessonPanel } from './ui/LessonPanel'
import { ChannelDetail } from './ui/mixer/ChannelDetail'
import { ChannelStripView } from './ui/mixer/ChannelStripView'
import { MasterStrip } from './ui/mixer/MasterStrip'
import { SessionPanel } from './ui/SessionPanel'
import { TrainView } from './ui/train/TrainView'
import { Transport } from './ui/Transport'

type View = 'mix' | 'train' | 'learn'
const SIDE_LABEL: Record<Side, string> = { lessons: 'Lessons', coach: 'AI coach', session: 'Session' }
const VIEW_LABEL: Record<View, string> = { mix: 'Mix', learn: 'Learn', train: 'Ear Training' }
type Side = 'lessons' | 'coach' | 'session'

function Welcome() {
  const { loadDemo, addFiles } = useStore.getState()
  const [busy, setBusy] = useState(false)
  return (
    <div className="surface mx-auto mt-16 max-w-xl rounded-[8px] p-8 text-center">
      <h2 className="mb-2 text-2xl font-semibold">Practise mixing like a pro</h2>
      <p className="mb-6 text-sm text-dim">
        Load the demo multitrack, which has deliberate problems to fix and guided lessons, or bring your own stems. Then use the AI coach for feedback, and the Train tab for ear training.
      </p>
      <div className="flex justify-center gap-3">
        <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); await loadDemo() }}>
          {busy ? 'Generating stems…' : 'Load demo multitrack'}
        </button>
        <label className="btn cursor-pointer">
          Use my stems…
          <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => e.target.files?.length && addFiles([...e.target.files])} />
        </label>
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>('mix')
  const [side, setSide] = useState<Side>('lessons')
  const channels = useStore((s) => s.mix.channels)
  const labRequest = useLabNav((s) => s.request)

  const go = (v: View) => {
    setView(v)
    if (v !== 'mix' && engine.playing) engine.stop()
    if (v !== 'learn') labPlayer.stop()
  }

  // Another component asked to open a lab (LearnView consumes the request on mount).
  useEffect(() => {
    if (labRequest && view !== 'learn') go('learn')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labRequest])

  useEffect(() => {
    startSnapshotCollector()
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && view === 'mix' && tag !== 'INPUT' && tag !== 'BUTTON' && tag !== 'SELECT') {
        e.preventDefault()
        engine.playing ? engine.stop() : engine.play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="sticky top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-panel px-4 py-2"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-tight">mix<span className="text-amber">istance</span></span>
          <span className="hidden text-[11px] text-dim md:inline">mixing practice studio</span>
        </div>
        {view === 'mix' && channels.length > 0 && <Transport />}
        <nav className="ml-auto flex rounded-[5px] border border-line bg-well p-0.5" aria-label="View">
          {(['mix', 'learn', 'train'] as const).map((v) => (
            <button
              key={v}
              onClick={() => go(v)}
              aria-current={view === v ? 'page' : undefined}
              className={`rounded-[4px] px-3.5 py-1 text-[13px] font-medium transition-colors ${view === v ? 'bg-panel-3 text-ink' : 'text-dim hover:text-ink'}`}
            >{VIEW_LABEL[v]}</button>
          ))}
        </nav>
      </header>

      {view === 'learn' ? (
        <LearnView />
      ) : view === 'train' ? (
        <TrainView />
      ) : channels.length === 0 ? (
        <Welcome />
      ) : (
        <main className="grid flex-1 gap-3 p-3 2xl:grid-cols-[1fr_380px] xl:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex max-w-full gap-3 self-start overflow-x-auto rounded-[6px] border border-line bg-well p-2">
              <div className="flex gap-1.5">{channels.map((c) => <ChannelStripView key={c.id} ch={c} />)}</div>
              <div className="w-px shrink-0 bg-line" />
              <MasterStrip />
            </div>
            <ChannelDetail />
          </div>
          <aside className="surface flex flex-col rounded-[6px] xl:max-h-[calc(100vh-70px)] xl:sticky xl:top-[62px]">
            <div className="flex border-b border-line">
              {(['lessons', 'coach', 'session'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 py-2 text-[13px] font-medium ${side === s ? 'border-b-2 border-amber text-ink' : 'border-b-2 border-transparent text-dim hover:text-ink'}`}
                >{SIDE_LABEL[s]}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {side === 'lessons' && <LessonPanel />}
              {side === 'coach' && <CoachPanel />}
              {side === 'session' && <SessionPanel />}
            </div>
          </aside>
        </main>
      )}
    </div>
  )
}
