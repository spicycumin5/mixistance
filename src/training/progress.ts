// Per-viewer practice history in localStorage. Every access is guarded: storage can be
// unavailable (private mode, blocked site data) and the app must still work.

const KEY = 'mixistance.progress'

export interface DrillStats {
  attempts: number
  correct: number
  streak: number
  best: number
  recent: number[] // last 20 scores, 0..1
}

interface Progress {
  drills: Record<string, DrillStats>
  lessons: Record<string, { completedAt: string }>
}

function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (p?.drills && p?.lessons) return p
  } catch { /* fall through */ }
  return { drills: {}, lessons: {} }
}

function save(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch { /* ignore */ }
}

export function drillStats(id: string): DrillStats {
  return load().drills[id] ?? { attempts: 0, correct: 0, streak: 0, best: 0, recent: [] }
}

/** Record a scored attempt (score 0..1; >= 0.999 counts as correct). */
export function recordDrill(id: string, score: number): DrillStats {
  const p = load()
  const s = p.drills[id] ?? { attempts: 0, correct: 0, streak: 0, best: 0, recent: [] }
  s.attempts++
  const correct = score >= 0.999
  if (correct) s.correct++
  s.streak = correct ? s.streak + 1 : 0
  s.best = Math.max(s.best, s.streak)
  s.recent = [...s.recent, score].slice(-20)
  p.drills[id] = s
  save(p)
  return s
}

export function lessonDone(id: string) {
  return !!load().lessons[id]
}

export function markLessonDone(id: string) {
  const p = load()
  p.lessons[id] ??= { completedAt: new Date().toISOString() }
  save(p)
}
