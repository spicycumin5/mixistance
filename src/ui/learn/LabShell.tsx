import { useEffect, useMemo, useRef, useState } from 'react'
import { labPlayer, type LabMode } from '../../audio/labPlayer'
import { LAB_FS, SOURCE_LABELS, sourceData, type LabSource } from '../../audio/sources'
import { db, peak, rms } from '../../lab/helpers'
import { defaultsOf, type LabDef, type LabRender, type ParamDef, type Params } from '../../lab/types'
import { Knob } from '../components/Knob'
import { useRaf } from '../hooks'
import { Markdownish } from '../Markdownish'
import { ImpulsePlot, LanePlot, SpectrumPlot, TransferCurvePlot, WaveformPlot, type View } from './plots'

const MODE_LABEL: Record<LabMode, string> = { dry: 'Dry', wet: 'Processed', delta: 'Delta' }
const MODE_TIP: Record<LabMode, string> = {
  dry: 'The original signal',
  wet: 'After the processor',
  delta: 'Processed minus dry: only what the processor changed',
}
const ZOOMS = [1, 2, 4, 8, 16, 32, 64, 128]
const defaultZoom = (s: LabSource) => (s === 'sine' ? 32 : 1)

function Stat({ label, dry, wet, unit = 'dB' }: { label: string; dry: number; wet: number; unit?: string }) {
  const d = wet - dry
  return (
    <div className="rounded border border-line bg-panel-2 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-dim">{label}</div>
      <div className="readout text-xs">
        <span className="text-dim">{dry.toFixed(1)}</span>
        <span className="text-dim"> → </span>
        <span className="text-amber">{wet.toFixed(1)}</span>
        <span className="text-dim"> {unit}</span>
        {Math.abs(d) >= 0.05 && <span className="ml-1 text-[10px] text-dim">({d > 0 ? '+' : ''}{d.toFixed(1)})</span>}
      </div>
    </div>
  )
}

function Explainer({ param, lab }: { param?: ParamDef; lab: LabDef<any> }) {
  if (!param) {
    return (
      <div className="text-xs leading-relaxed text-dim">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink">What does this knob do?</div>
        Hover over any control to see what it does, what to listen for, and which part of the graphs it affects. Those parts light up in yellow.
        <div className="mt-2">Tip: <span className="text-ink">Delta</span> plays only what the {lab.title.toLowerCase()} changed. It is the fastest way to hear what a setting is doing.</div>
      </div>
    )
  }
  const rows: [string, string][] = [['What it is', param.what], ['What you hear', param.hear], ['What to watch', param.see], ['Typical', param.typical]]
  return (
    <div className="text-xs leading-relaxed">
      <div className="mb-1.5 text-sm font-semibold text-amber">{param.label}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="mb-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-dim">{k}</div>
          <div className="text-ink/90">{v}</div>
        </div>
      ))}
    </div>
  )
}

export function LabShell({ lab, initialParams }: { lab: LabDef<any>; initialParams?: Params }) {
  const [params, setParams] = useState<Params>(() => ({ ...defaultsOf(lab), ...initialParams }))
  const [source, setSource] = useState<LabSource>(lab.sources[0])
  const [render, setRender] = useState<LabRender | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<LabMode>('wet')
  const [playing, setPlaying] = useState(false)
  const [match, setMatch] = useState(true)
  const [scale, setScale] = useState<'lin' | 'db'>(lab.defaultScale ?? 'lin')
  const [zoom, setZoom] = useState(defaultZoom(lab.sources[0]))
  const [pos, setPos] = useState(0) // 0-1 centre of the view
  const [hover, setHover] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const playhead = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const activeKey = drag ?? hover
  const activeParam = lab.params.find((p) => p.key === activeKey)
  const active = activeParam?.highlight ?? null

  // Render (debounced). A sequence number drops stale async results.
  useEffect(() => {
    const id = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      const src = sourceData(source, LAB_FS)
      const r = await lab.render(src, params, { fs: LAB_FS, source })
      if (id !== seq.current) return
      setRender(r)
      setBusy(false)
    }, 30)
    return () => clearTimeout(t)
  }, [lab, params, source])

  // Hand the render to the player.
  useEffect(() => {
    if (!render) return
    const { dry, wet } = render.audio
    const delta = new Float32Array(dry.length)
    for (let i = 0; i < dry.length; i++) delta[i] = wet[i] - dry[i]
    const wetLevel = match ? Math.min(8, Math.max(0.125, rms(dry) / Math.max(rms(wet), 1e-9))) : 1
    labPlayer.setBuffers({ dry, wet, delta }, render.fs, { dry: 1, wet: wetLevel, delta: 1 })
  }, [render, match])

  useEffect(() => labPlayer.setMode(mode), [mode])
  useEffect(() => () => labPlayer.stop(), [])
  useEffect(() => {
    const up = () => setDrag(null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const togglePlay = async () => {
    if (labPlayer.playing) { labPlayer.stop(); setPlaying(false) }
    else { labPlayer.setMode(mode); await labPlayer.play(); setPlaying(true) }
  }
  const toggleRef = useRef(togglePlay)
  toggleRef.current = togglePlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        // Blur a focused button, so the key-up doesn't also click it.
        if (tag === 'BUTTON') (e.target as HTMLElement).blur()
        toggleRef.current()
      }
      if (e.key === '1') setMode('dry')
      if (e.key === '2') setMode('wet')
      if (e.key === '3') setMode('delta')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const show = render?.show ?? render?.audio
  const dur = show ? show.dry.length / (render?.fs ?? LAB_FS) : 1
  const view: View = useMemo(() => {
    const span = dur / zoom
    const t0 = Math.min(Math.max(0, pos * dur - span / 2), dur - span)
    return { t0, t1: t0 + span }
  }, [dur, zoom, pos])

  useRaf(() => {
    const el = playhead.current
    if (!el) return
    const p = labPlayer.position()
    if (p === null || p < view.t0 || p > view.t1) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.style.left = `${((p - view.t0) / (view.t1 - view.t0)) * 100}%`
  })

  const stats = useMemo(() => {
    if (!render) return null
    const { dry, wet } = render.audio
    const pd = db(peak(dry)), pw = db(peak(wet)), rd = db(rms(dry)), rw = db(rms(wet))
    return { pd, pw, rd, rw, cd: pd - rd, cw: pw - rw }
  }, [render])

  const set = (p: Partial<Params>) => setParams((cur) => ({ ...cur, ...p }) as Params)
  const changeSource = (s: LabSource) => {
    setSource(s)
    setZoom(defaultZoom(s))
    setPos(0)
  }

  const tour = lab.tour
  const ts = tour[step]
  const passed = ts?.check ? ts.check(params as any, source) : false

  const hoverProps = (key: string) => ({
    onPointerEnter: () => setHover(key),
    onPointerLeave: () => setHover((h) => (h === key ? null : h)),
    onPointerDown: () => setDrag(key),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="prose-lesson rounded-md border border-line bg-panel-2 p-3 text-sm text-ink/90">
        <Markdownish text={lab.concept} />
      </div>

      {/* Transport row */}
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn ${playing ? '' : 'btn-primary'} min-w-20`} onClick={togglePlay} title="Play / stop (Space)" aria-label={playing ? 'Stop' : 'Play'}>
          {playing ? '■ Stop' : '▶ Play'}
        </button>
        <div className="flex overflow-hidden rounded-md border border-line">
          {(['dry', 'wet', 'delta'] as const).map((m, i) => (
            <button
              key={m}
              title={`${MODE_TIP[m]} (key ${i + 1})`}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-sm ${mode === m ? 'bg-amber font-semibold text-black' : 'bg-panel-2 text-dim hover:text-ink'}`}
            >{MODE_LABEL[m]}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-dim" title="Plays Processed at the same average loudness as Dry, so louder doesn't fool you into thinking better">
          <input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} className="accent-amber" />
          Match loudness
        </label>
        <select
          className="ml-auto rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
          value={source}
          onChange={(e) => changeSource(e.target.value as LabSource)}
        >
          {lab.sources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>
      </div>

      <div className={`grid gap-3 ${render?.curve ? 'lg:grid-cols-[1fr_260px]' : ''}`}>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-3 text-[10px] uppercase tracking-wider text-dim">
            <span>{render?.show?.label ?? 'Waveform'}</span>
            <span className="flex items-center gap-1 normal-case tracking-normal"><span className="inline-block h-2 w-3 bg-[#8b8a93]/60" />dry</span>
            <span className="flex items-center gap-1 normal-case tracking-normal"><span className="inline-block h-2 w-3 bg-amber" />processed</span>
            {busy && <span className="normal-case tracking-normal text-amber">rendering…</span>}
            <div className="ml-auto flex overflow-hidden rounded border border-line normal-case tracking-normal">
              {(['lin', 'db'] as const).map((s) => (
                <button key={s} onClick={() => setScale(s)} title={s === 'lin' ? 'Linear: the actual waveform' : 'Decibels: shows quiet detail (noise, tails)'}
                  className={`px-2 py-0.5 ${scale === s ? 'bg-panel-3 text-ink' : 'text-dim'}`}>{s === 'lin' ? 'Wave' : 'dB'}</button>
              ))}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-md border border-line">
            {render && show ? (
              <>
                <WaveformPlot dry={show.dry} wet={show.wet} fs={render.fs} view={view} scale={scale} levelLines={render.levelLines} zones={render.zones} active={active} />
                {render.lanes?.map((l, i) => <LanePlot key={i} lane={l} fs={render.fs} view={view} active={active} />)}
              </>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-dim">Rendering…</div>
            )}
            <div ref={playhead} className="pointer-events-none absolute top-0 bottom-0 hidden w-px bg-white/80" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-dim">
            <span>Zoom</span>
            <div className="flex overflow-hidden rounded border border-line">
              {ZOOMS.map((z) => (
                <button key={z} onClick={() => setZoom(z)} className={`px-1.5 py-0.5 ${zoom === z ? 'bg-panel-3 text-ink' : 'hover:text-ink'}`}>×{z}</button>
              ))}
            </div>
            <input
              type="range" min={0} max={1} step={0.001} value={pos} disabled={zoom === 1}
              onChange={(e) => setPos(Number(e.target.value))} className="min-w-24 flex-1 accent-amber" aria-label="Scroll"
            />
            <span className="readout">{(view.t0 * 1000).toFixed(0)}–{(view.t1 * 1000).toFixed(0)} ms</span>
          </div>
          {stats && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Stat label="Peak" dry={stats.pd} wet={stats.pw} unit="dBFS" />
              <Stat label="RMS (average level)" dry={stats.rd} wet={stats.rw} unit="dBFS" />
              <Stat label="Crest factor (peak − RMS)" dry={stats.cd} wet={stats.cw} />
            </div>
          )}
          {render?.spectrum && <div className="mt-3"><SpectrumPlot spec={render.spectrum} active={active} /></div>}
          {render?.ir && <div className="mt-3"><ImpulsePlot spec={render.ir} active={active} /></div>}
        </div>
        {render?.curve && <div><TransferCurvePlot spec={render.curve} active={active} /></div>}
      </div>

      {/* Controls and explainer */}
      <div className="grid gap-3 md:grid-cols-[1fr_300px]">
        <div className="rounded-md border border-line bg-panel-2 p-3">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
            {lab.params.map((p) =>
              p.kind === 'choice' ? (
                <div key={p.key} {...hoverProps(p.key)} className={`rounded-md p-1 ${activeKey === p.key ? 'bg-panel-3' : ''}`}>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">{p.label}</div>
                  <div className="flex overflow-hidden rounded border border-line">
                    {p.options.map((o) => (
                      <button key={o.value} onClick={() => set({ [p.key]: o.value })}
                        className={`px-2 py-1 text-xs ${params[p.key] === o.value ? 'bg-amber font-semibold text-black' : 'bg-panel text-dim hover:text-ink'}`}>{o.label}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={p.key} {...hoverProps(p.key)} className={`rounded-md p-1 ${activeKey === p.key ? 'bg-panel-3' : ''}`}>
                  <Knob
                    label={p.label} min={p.min} max={p.max} log={p.log} step={p.step} defaultValue={p.default}
                    value={Number(params[p.key])} format={p.format} size={46}
                    onChange={(v) => set({ [p.key]: v })}
                  />
                </div>
              ),
            )}
          </div>
          <div className="mt-2 text-[10px] text-dim">Drag knobs vertically (shift = fine), scroll to nudge, double-click to reset. Space plays/stops, 1/2/3 switch Dry/Processed/Delta.</div>
        </div>
        <div className="rounded-md border border-line bg-panel-2 p-3">
          <Explainer param={activeParam} lab={lab} />
        </div>
      </div>

      {/* Guided tour */}
      {ts && (
        <div className="rounded-md border border-amber/40 bg-panel-2 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="chip bg-amber/15 text-amber">Guided tour</span>
            <span className="text-xs text-dim">Step {step + 1} of {tour.length}</span>
            {ts.check && (passed ? <span className="chip bg-good/15 text-good">✓ done</span> : <span className="chip bg-panel-3 text-dim">try it</span>)}
            <div className="ml-auto flex gap-1">
              {tour.map((_, i) => (
                <button key={i} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`}
                  className={`h-1.5 w-5 rounded-full ${i === step ? 'bg-amber' : i < step ? 'bg-amber/40' : 'bg-panel-3'}`} />
              ))}
            </div>
          </div>
          <div className="prose-lesson text-sm"><Markdownish text={ts.text} /></div>
          <div className="mt-2 flex gap-2">
            <button className="btn !py-1 !text-xs" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
            {(ts.set || (ts.source && ts.source !== source)) && (
              <button className="btn !py-1 !text-xs" onClick={() => {
                if (ts.set) set(ts.set)
                if (ts.source && ts.source !== source) changeSource(ts.source)
              }}>Set it for me</button>
            )}
            <button
              className={`btn !py-1 !text-xs ${passed || !ts.check ? 'btn-primary' : ''}`}
              disabled={step === tour.length - 1}
              onClick={() => setStep(step + 1)}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
