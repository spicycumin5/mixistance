import { useRef, useState, type ReactNode } from 'react'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import { fmtTime } from './format'
import { usePolled, useRaf } from './hooks'

function TBtn({ label, lit, litColor, onClick, children }: { label: string; lit?: boolean; litColor?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={lit}
      onClick={onClick}
      className="btn flex h-8 w-9 items-center justify-center !p-0"
      style={lit ? { color: litColor } : undefined}
    >{children}</button>
  )
}

const Icon = {
  start: <svg width="14" height="12" viewBox="0 0 14 12"><rect x="0" y="0" width="2.2" height="12" fill="currentColor" /><path d="M13 0v12L3.5 6z" fill="currentColor" /></svg>,
  play: <svg width="12" height="13" viewBox="0 0 12 13"><path d="M0 0l12 6.5L0 13z" fill="currentColor" /></svg>,
  stop: <svg width="11" height="11" viewBox="0 0 11 11"><rect width="11" height="11" rx="1" fill="currentColor" /></svg>,
  cycle: <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M5 2.5h8.5a2.5 2.5 0 012.5 2.5v2a2.5 2.5 0 01-2.5 2.5H11" /><path d="M13 9.5H4.5A2.5 2.5 0 012 7V5a2.5 2.5 0 012.5-2.5H7" /><path d="M7 0.5l2 2-2 2" fill="none" /><path d="M11 7.5l-2 2 2 2" fill="none" /></svg>,
}

/** Control-bar transport: buttons, the LCD (position, time, tempo, loudness) and the reference player. */
export function Transport() {
  const playing = usePolled(() => engine.playing, 100)
  const duration = usePolled(() => (engine.ctx ? engine.duration : 0), 500)
  const bpm = useStore((s) => s.mix.bpm)
  // The engine owns the cycle region; the timeline ruler can change it too.
  const loop = usePolled(() => engine.loop, 100)
  const [refOn, setRefOn] = useState(false)
  const [refDb, setRefDb] = useState(-6)
  const hasRef = usePolled(() => engine.hasReference, 500)
  const barEl = useRef<HTMLSpanElement>(null)
  const timeEl = useRef<HTMLSpanElement>(null)
  const lufsEl = useRef<HTMLSpanElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const refInput = useRef<HTMLInputElement>(null)

  useRaf(() => {
    const p = engine.ctx ? engine.position : 0
    const beat = 60 / bpm
    const bar = Math.floor(p / (beat * 4)) + 1
    const b = Math.floor((p / beat) % 4) + 1
    const div = Math.floor(((p / beat) % 1) * 4) + 1
    if (barEl.current) barEl.current.textContent = `${String(bar).padStart(3, ' ')} ${b} ${div}`
    if (timeEl.current) timeEl.current.textContent = fmtTime(p)
    if (lufsEl.current) {
      const s = engine.loudness?.shortTerm
      lufsEl.current.textContent = s !== undefined && isFinite(s) ? s.toFixed(1) : '—'
    }
    if (head.current && duration) head.current.style.left = `${(p / duration) * 100}%`
  })

  const toggleLoop = () => {
    // Default cycle: the 4 bars around the playhead.
    const bar = (60 / bpm) * 4
    const start = loop.end > loop.start ? loop.start : Math.floor(engine.position / bar) * bar
    const next = { enabled: !loop.enabled, start, end: loop.end > loop.start ? loop.end : Math.min(duration, start + bar * 4) }
    engine.setLoop(next)
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        <TBtn label="Go to start" onClick={() => engine.seek(loop.enabled ? loop.start : 0)}>{Icon.start}</TBtn>
        <TBtn label={playing ? 'Stop (Space)' : 'Play (Space)'} lit={playing} litColor="var(--color-play)" onClick={() => (engine.playing ? engine.stop() : engine.play())}>
          {playing ? Icon.stop : Icon.play}
        </TBtn>
        <TBtn label="Cycle (drag in the ruler to set the range)" lit={loop.enabled} litColor="var(--color-cycle)" onClick={toggleLoop}>{Icon.cycle}</TBtn>
      </div>

      {/* LCD */}
      <div className="well relative flex h-11 items-stretch overflow-hidden rounded-[5px] text-ink">
        <div className="flex flex-col justify-center px-3">
          <span ref={barEl} className="readout text-[18px] font-medium leading-none tracking-wide" />
          <span className="mt-0.5 text-[10px] leading-none text-dim">position</span>
        </div>
        <div className="my-2 w-px bg-line" />
        <div className="flex flex-col justify-center px-3">
          <span ref={timeEl} className="readout text-[14px] leading-none" />
          <span className="mt-1 text-[10px] leading-none text-dim">time</span>
        </div>
        <div className="my-2 w-px bg-line" />
        <div className="flex flex-col justify-center px-3">
          <span className="readout text-[14px] leading-none">{bpm}</span>
          <span className="mt-1 text-[10px] leading-none text-dim">tempo, 4/4</span>
        </div>
        <div className="my-2 w-px bg-line" />
        <div className="flex flex-col justify-center px-3" title="Short-term loudness of what you're hearing">
          <span ref={lufsEl} className="readout text-[14px] leading-none" />
          <span className="mt-1 text-[10px] leading-none text-dim">LUFS short</span>
        </div>
        {/* Song position strip: click to seek */}
        <div
          className="absolute inset-x-0 bottom-0 h-[5px] cursor-pointer bg-white/5"
          title="Click to move the playhead"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            engine.seek(((e.clientX - r.left) / r.width) * duration)
          }}
        >
          {loop.enabled && duration > 0 && (
            <div className="absolute inset-y-0 bg-cycle/50" style={{ left: `${(loop.start / duration) * 100}%`, width: `${((loop.end - loop.start) / duration) * 100}%` }} />
          )}
          <div ref={head} className="absolute inset-y-0 w-[3px] bg-ink" />
        </div>
      </div>

      <div className="flex items-center gap-1.5">
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
          <button className="btn !py-1 text-xs" onClick={() => refInput.current?.click()} title="Load a commercial track to compare against">Add reference…</button>
        ) : (
          <>
            <button
              className="btn !py-1 text-xs"
              style={refOn ? { color: 'var(--color-amber)' } : undefined}
              onClick={() => { engine.setListenToRef(!refOn); setRefOn(!refOn) }}
              title="Switch between your mix and the reference track"
            >{refOn ? 'Hearing reference' : 'Hearing mix'}</button>
            <label className="flex items-center gap-1 text-xs text-dim" title="Turn the reference down until its loudness matches your mix, then compare tone and balance">
              Ref level
              <input
                type="range" min={-24} max={0} step={0.5} value={refDb}
                className="w-20 accent-[#f0a43a]"
                onChange={(e) => { const v = +e.target.value; setRefDb(v); engine.setRefLevelDb(v) }}
              />
              <span className="readout w-11 text-ink">{refDb} dB</span>
            </label>
          </>
        )}
      </div>
    </div>
  )
}
