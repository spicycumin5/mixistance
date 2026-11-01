import { useEffect, useState } from 'react'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import { LESSONS, type CheckCtx, type CheckResult, type Lesson } from '../training/lessons'
import { lessonDone, markLessonDone } from '../training/progress'
import { usePolled } from './hooks'
import { askCoach } from '../ai/feedbackClient'
import { Markdownish } from './Markdownish'

export function buildCheckCtx(): CheckCtx {
  const mix = useStore.getState().mix
  return {
    mix,
    ch: (id) => mix.channels.find((c) => c.id === id),
    gr: (id) => engine.strips.get(id)?.grRecentMax ?? 0,
    master: engine.loudness,
    playing: engine.playing,
  }
}

const TOPIC_COLORS: Record<Lesson['topic'], string> = {
  Balance: 'bg-zinc-300', EQ: 'bg-sky-400', Compression: 'bg-amber', Space: 'bg-violet-400', Finishing: 'bg-good',
}

export function LessonPanel() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [step, setStep] = useState(0)
  const hasDemo = useStore((s) => s.mix.channels.some((c) => c.id === 'vox'))

  if (!lesson) {
    return (
      <div className="flex flex-col gap-2">
        {!hasDemo && <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-warn">Lessons use the demo multitrack. Load it from the Session tab.</p>}
        {LESSONS.map((l) => (
          <button
            key={l.id}
            className="rounded-lg border border-line bg-panel-2 p-3 text-left transition hover:border-zinc-500"
            onClick={() => { setLesson(l); setStep(0) }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className={`chip text-black ${TOPIC_COLORS[l.topic]}`}>{l.topic}</span>
              <span className="text-[11px] text-dim">{l.minutes} min · {l.steps.length} steps</span>
              {lessonDone(l.id) && <span className="ml-auto text-xs text-good">✓ done</span>}
            </div>
            <div className="text-sm font-semibold">{l.title}</div>
            <div className="mt-0.5 text-xs text-dim">{l.summary}</div>
          </button>
        ))}
      </div>
    )
  }

  return <LessonRunner lesson={lesson} step={step} setStep={setStep} onExit={() => setLesson(null)} />
}

function LessonRunner({ lesson, step, setStep, onExit }: { lesson: Lesson; step: number; setStep: (n: number) => void; onExit: () => void }) {
  const s = lesson.steps[step]
  const result: CheckResult | null = usePolled(() => (s.check ? s.check(buildCheckCtx()) : null), 250)
  const [coach, setCoach] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false })
  const last = step === lesson.steps.length - 1

  useEffect(() => {
    if (s.focus) useStore.getState().select(s.focus)
    setCoach({ loading: false })
  }, [s])

  useEffect(() => {
    if (last && (!s.check || result?.pass)) markLessonDone(lesson.id)
  }, [last, result?.pass, s.check, lesson.id])

  return (
    <div className="flex flex-col gap-3">
      <button className="self-start text-xs text-dim hover:text-ink" onClick={onExit}>← All lessons</button>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-dim">{lesson.title}</div>
        <div className="mt-1 flex gap-1">
          {lesson.steps.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} className={`h-1.5 flex-1 rounded ${i === step ? 'bg-amber' : i < step ? 'bg-amber/40' : 'bg-panel-3'}`} />
          ))}
        </div>
      </div>
      <h3 className="text-base font-semibold">{step + 1}. {s.title}</h3>
      <div className="prose-lesson text-sm text-ink/90"><Markdownish text={s.body} /></div>

      {result && (
        <div className={`rounded-md border p-2 text-sm ${result.pass ? 'border-good/40 bg-good/10 text-good' : 'border-line bg-panel-2 text-dim'}`}>
          {result.pass ? '✓ Looks good. That is a pro-standard move.' : <>◌ {result.hint}</>}
        </div>
      )}
      {result && !result.pass && (
        <button
          className="btn self-start !text-xs"
          disabled={coach.loading}
          onClick={async () => {
            setCoach({ loading: true })
            try {
              const text = await askCoach({ mode: 'lesson', lesson: lesson.title, step: s.title, instructions: s.body, hint: result.hint })
              setCoach({ loading: false, text })
            } catch (e) {
              setCoach({ loading: false, error: (e as Error).message })
            }
          }}
        >{coach.loading ? 'Asking coach…' : '✦ Ask the AI coach why'}</button>
      )}
      {coach.text && <div className="prose-lesson rounded-md border border-violet-400/30 bg-violet-400/5 p-2 text-sm"><Markdownish text={coach.text} /></div>}
      {coach.error && <div className="text-xs text-bad">{coach.error}</div>}

      <div className="mt-1 flex gap-2">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {last ? (
          <button className="btn btn-primary" onClick={onExit}>Finish</button>
        ) : (
          <button className={`btn ${!s.check || result?.pass ? 'btn-primary' : ''}`} onClick={() => setStep(step + 1)}>Next</button>
        )}
      </div>
    </div>
  )
}
