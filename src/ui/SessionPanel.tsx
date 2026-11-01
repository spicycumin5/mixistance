import { useRef, useState } from 'react'
import { exportSession, listSessions, saveSession, useStore } from '../state/store'
import type { MixState } from '../state/types'

export function SessionPanel() {
  const { loadDemo, addFiles, applySession } = useStore.getState()
  const hasDemo = useStore((s) => s.mix.channels.some((c) => c.id === 'vox'))
  const [name, setName] = useState('My mix')
  const [sessions, setSessions] = useState(listSessions)
  const [msg, setMsg] = useState('')
  const stemInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-4 text-sm">
      <section className="flex flex-col gap-2">
        <h4 className="text-[11px] uppercase tracking-wider text-dim">Audio</h4>
        <button className="btn" disabled={hasDemo} onClick={() => loadDemo()}>
          {hasDemo ? '✓ Demo multitrack loaded' : 'Load demo multitrack'}
        </button>
        <button className="btn" onClick={() => stemInput.current?.click()}>+ Add your own stems…</button>
        <input
          ref={stemInput} type="file" accept="audio/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) addFiles([...e.target.files]); e.target.value = '' }}
        />
        <p className="text-[11px] text-dim">
          Stems should start at the same point in time (export them from your DAW from bar 1). WAV, MP3, OGG and FLAC all work. Audio stays in your browser.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-[11px] uppercase tracking-wider text-dim">Save settings</h4>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 outline-none focus:border-amber" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { saveSession(name, useStore.getState().mix); setSessions(listSessions()); setMsg(`Saved "${name}"`) }}>Save</button>
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={() => exportSession(useStore.getState().mix)}>Export .json</button>
          <button className="btn flex-1" onClick={() => importInput.current?.click()}>Import .json</button>
          <input
            ref={importInput} type="file" accept="application/json" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const data = JSON.parse(await f.text()) as { mix?: MixState }
                if (!data.mix?.channels) throw new Error()
                applySession(data.mix)
                setMsg('Imported settings for matching channels')
              } catch {
                setMsg('That file is not a Mixistance session')
              }
              e.target.value = ''
            }}
          />
        </div>
        {msg && <p className="text-[11px] text-good">{msg}</p>}
        <p className="text-[11px] text-dim">Sessions store settings only. Loading one applies it to channels with the same name/id (for example, the demo stems).</p>
        {sessions.length > 0 && (
          <ul className="flex flex-col gap-1">
            {sessions.map((s) => (
              <li key={s.name} className="flex items-center gap-2 rounded-md border border-line px-2 py-1">
                <span className="flex-1 truncate">{s.name}</span>
                <span className="text-[10px] text-dim">{new Date(s.savedAt).toLocaleDateString()}</span>
                <button className="btn !px-2 !py-0.5 !text-xs" onClick={() => { applySession(s.mix); setMsg(`Loaded "${s.name}"`) }}>Load</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
