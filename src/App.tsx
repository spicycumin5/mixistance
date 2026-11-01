import { useEffect, useState } from 'react'
import { startSnapshotCollector } from './ai/snapshot'
import { engine } from './audio/engine'
import { useStore } from './state/store'
import { CoachPanel } from './ui/CoachPanel'
import { LessonPanel } from './ui/LessonPanel'
import { ChannelDetail } from './ui/mixer/ChannelDetail'
import { ChannelStripView } from './ui/mixer/ChannelStripView'
import { MasterStrip } from './ui/mixer/MasterStrip'
import { SessionPanel } from './ui/SessionPanel'
import { TrainView } from './ui/train/TrainView'
import { Transport } from './ui/Transport'

type View = 'mix' | 'train'
type Side = 'lessons' | 'coach' | 'session'

function Welcome() {
  const { loadDemo, addFiles } = useStore.getState()
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-xl border border-line bg-panel p-8 text-center">
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
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-line bg-[#0f1013]/95 px-4 py-2 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">mix<span className="text-amber">istance</span></span>
          <span className="hidden text-[11px] text-dim sm:inline">mixing practice studio</span>
        </div>
        <nav className="flex overflow-hidden rounded-md border border-line">
          {(['mix', 'train'] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); if (v === 'train') engine.playing && engine.stop() }}
              className={`px-4 py-1.5 text-sm font-medium ${view === v ? 'bg-panel-3 text-ink' : 'bg-panel text-dim hover:text-ink'}`}
            >{v === 'mix' ? 'Mix' : 'Ear Training'}</button>
          ))}
        </nav>
        {view === 'mix' && channels.length > 0 && <div className="ml-auto"><Transport /></div>}
      </header>

      {view === 'train' ? (
        <TrainView />
      ) : channels.length === 0 ? (
        <Welcome />
      ) : (
        <main className="grid flex-1 gap-3 p-3 2xl:grid-cols-[1fr_380px] xl:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex gap-3 overflow-x-auto pb-1">
              <div className="flex gap-2">{channels.map((c) => <ChannelStripView key={c.id} ch={c} />)}</div>
              <MasterStrip />
            </div>
            <ChannelDetail />
          </div>
          <aside className="flex flex-col rounded-lg border border-line bg-panel xl:max-h-[calc(100vh-70px)] xl:sticky xl:top-[58px]">
            <div className="flex border-b border-line">
              {(['lessons', 'coach', 'session'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider ${side === s ? 'border-b-2 border-amber text-ink' : 'text-dim hover:text-ink'}`}
                >{s === 'coach' ? 'AI Coach' : s}</button>
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
