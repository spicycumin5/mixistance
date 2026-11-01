import { buildSnapshot } from './snapshot'

export type SuggestionAction = 'fader' | 'pan' | 'eq_band' | 'compressor' | 'reverb_send' | 'delay_send'

/** Mirrors the JSON schema in server/index.ts. Unused fields come back as null. */
export interface Suggestion {
  channelId: string
  action: SuggestionAction
  title: string
  rationale: string
  value: number | null // fader dB, pan -1..1, or send dB
  bandIndex: number | null
  freq: number | null
  gainDb: number | null
  q: number | null
  thresholdDb: number | null
  ratio: number | null
  attackMs: number | null
  releaseMs: number | null
}

export interface MixFeedback {
  overall: string
  strengths: string[]
  issues: { severity: 'high' | 'medium' | 'low'; area: string; problem: string; fix: string }[]
  suggestions: Suggestion[]
  nextFocus: string
}

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {
    throw new Error('Coach server not reachable. Run `npm run server` in a second terminal.')
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Coach error (${res.status})`)
  return data as T
}

export function getMixFeedback(goal: string): Promise<MixFeedback> {
  return post<MixFeedback>({ mode: 'mix', goal, snapshot: buildSnapshot() })
}

export async function askCoach(q: { mode: 'lesson'; lesson: string; step: string; instructions: string; hint?: string }) {
  const { text } = await post<{ text: string }>({ ...q, snapshot: buildSnapshot() })
  return text
}
