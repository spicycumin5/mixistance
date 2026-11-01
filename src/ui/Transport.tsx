import { useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import { fmtTime } from './format'
import { usePolled, useRaf } from './hooks'

export function Transport() {
  const playing = usePolled(() => engine.playing, 100)
  const duration = usePolled(() => (engine.ctx ? engine.duration : 0), 500)
  const [loop, setLoop] = useState(engine.loop)
  const [refOn, setRefOn] = useState(false)
  const [refDb, setRefDb] = useState(-6)
  const hasRef = usePolled(() => engine.hasReference, 500)
  const posEl = useRef<HTMLSpanElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const refInput = useRef<HTMLInputElement>(null)

  useRaf(() => {
    const p = engine.ctx ? engine.position : 0
    if (posEl.current) posEl.current.textContent = fmtTime(p)
    if (head.current && duration) head.current.style.left = `${(p / duration) * 100}%`
  })

  const toggleLoop = () => {
    // Default loop: the 4 bars around the playhead.
    const bar = (60 / useStore.getState().mix.bpm) * 4
    const start = loop.end > loop.start ? loop.start : Math.floor(engine.position / bar) * bar
    const next = { enabled: !loop.enabled, start, end: loop.end > loop.start ? loop.end : Math.min(duration, start + bar * 4) }
    setLoop(next)
    engine.setLoop(next)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className="btn btn-primary w-20"
        onClick={() => (engine.playing ? engine.stop() : engine.play())}
        title="Space"
      >{playing ? '■ Stop' : '▶ Play'}</button>
      <button className="btn" onClick={() => engine.seek(loop.enabled ? loop.start : 0)} title="Return to start">⏮</button>
      <button className={`btn ${loop.enabled ? '!border-amber !text-amber' : ''}`} onClick={toggleLoop} title="Loop 4 bars">⟲ Loop</button>
      <div
        className="relative h-6 w-48 cursor-pointer rounded bg-black/50"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          engine.seek(((e.clientX - r.left) / r.width) * duration)
        }}
      >
        {loop.enabled && duration > 0 && (
          <div className="absolute inset-y-0 bg-amber/20" style={{ left: `${(loop.start / duration) * 100}%`, width: `${((loop.end - loop.start) / duration) * 100}%` }} />
        )}
        <div ref={head} className="absolute inset-y-0 w-0.5 bg-amber" />
      </div>
      <span ref={posEl} className="readout w-14 text-sm" />
      <div className="ml-3 flex items-center gap-1 border-l border-line pl-3">
        <input
          ref={refInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            engine.setReference(await engine.decode(await f.arrayBuffer()))
            engine.setRefLevelDb(refDb)
          }}
        />
        {!hasRef ? (
          <button className="btn" onClick={() => refInput.current?.click()} title="Load a commercial track to compare against">+ Reference</button>
        ) : (
          <>
            <button
              className={`btn ${refOn ? '!border-good !text-good' : ''}`}
              onClick={() => { engine.setListenToRef(!refOn); setRefOn(!refOn) }}
              title="Toggle between your mix and the reference track"
            >{refOn ? 'Hearing: REF' : 'Hearing: MIX'}</button>
            <label className="flex items-center gap-1 text-xs text-dim" title="Turn the reference down until its LUFS matches your mix, then compare tone and balance">
              Ref lvl
              <input
                type="range" min={-24} max={0} step={0.5} value={refDb}
                className="w-20 accent-amber"
                onChange={(e) => { const v = +e.target.value; setRefDb(v); engine.setRefLevelDb(v) }}
              />
              <span className="readout w-10">{refDb}dB</span>
            </label>
          </>
        )}
      </div>
    </div>
  )
}
