// Mix coach API. Keeps the Anthropic credential server-side; the browser only sends a
// numeric snapshot of the mix (settings + spectrum/level statistics).

import Anthropic from '@anthropic-ai/sdk'
import express from 'express'

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = process.env.MIXISTANCE_MODEL ?? 'claude-opus-5-5'

const client = new Anthropic()
const app = express()
app.use(express.json({ limit: '1mb' }))

const SYSTEM = `You are a senior mix engineer coaching an intermediate home-studio mixer inside "Mixistance", a practice app.

The app sends a JSON snapshot of the session: per-channel settings (trim, fader, pan, a 6-band EQ where band 0 is a high-pass, 1 low shelf, 2 and 3 peaking, 4 high shelf, 5 low-pass; compressor; reverb/delay send levels) and statistics measured while the mix played (average dB per frequency band, peak, RMS, crest factor, master LUFS and true peak). Band energies are relative analyzer readings: compare channels against each other and against typical spectral balance rather than treating the absolute numbers as calibrated.

Coach like a professional:
- Name specific channels, frequencies, dB amounts and time constants.
- Prioritise what most affects the overall mix: balance and masking first, then tone, dynamics, space, and headroom.
- Explain *why* in one sentence of mix theory, so the learner builds judgment, not just settings.
- Use the analysis to justify claims (e.g. "keys and bass both peak in the 150-400 Hz band").
- Suggest moderate, reversible moves (EQ usually within ±6 dB). Prefer cuts over boosts when fixing problems.
- A pre-master mix should peak around -6 to -3 dBTP with integrated loudness roughly -23 to -16 LUFS; do not push for streaming loudness on the mix bus.
- If little or no audio was analyzed (secondsAnalyzed under ~5), say so and base advice on settings only.
- Only reference channel ids that exist in the snapshot.`

const nullableNumber = { type: ['number', 'null'] }
const FEEDBACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overall', 'strengths', 'issues', 'suggestions', 'nextFocus'],
  properties: {
    overall: { type: 'string', description: '2-3 sentence verdict on the mix as a whole.' },
    strengths: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'area', 'problem', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          area: { type: 'string', description: 'e.g. "Low end", "Vocal", "Dynamics", "Space", "Headroom"' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    suggestions: {
      type: 'array',
      description: 'Up to 6 concrete parameter changes the app can apply. Set unused numeric fields to null.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['channelId', 'action', 'title', 'rationale', 'value', 'bandIndex', 'freq', 'gainDb', 'q', 'thresholdDb', 'ratio', 'attackMs', 'releaseMs'],
        properties: {
          channelId: { type: 'string' },
          action: { type: 'string', enum: ['fader', 'pan', 'eq_band', 'compressor', 'reverb_send', 'delay_send'] },
          title: { type: 'string', description: 'Short label, e.g. "Cut keys 320 Hz by 4 dB"' },
          rationale: { type: 'string' },
          value: { ...nullableNumber, description: 'fader/send: new level in dB; pan: -1 (L) to 1 (R)' },
          bandIndex: { type: ['integer', 'null'], description: 'eq_band: 0-5' },
          freq: nullableNumber,
          gainDb: nullableNumber,
          q: nullableNumber,
          thresholdDb: nullableNumber,
          ratio: nullableNumber,
          attackMs: nullableNumber,
          releaseMs: nullableNumber,
        },
      },
    },
    nextFocus: { type: 'string', description: 'The single skill the learner should practise next, and which drill or lesson fits it.' },
  },
} as const

function textOf(msg: Anthropic.Beta.BetaMessage) {
  return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

async function ask(userContent: string, schema?: Record<string, unknown>) {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
    system: SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  })
  if (msg.stop_reason === 'refusal') throw new Error('The coach declined this request.')
  if (msg.stop_reason === 'max_tokens') throw new Error('The coach response was cut off; try again.')
  return textOf(msg)
}

app.post('/api/feedback', async (req, res) => {
  const { mode, snapshot } = req.body ?? {}
  try {
    if (mode === 'mix') {
      const goal = String(req.body.goal ?? '').slice(0, 500)
      const text = await ask(
        `Review my mix.${goal ? ` My goal / genre reference: ${goal}.` : ''}\n\nSession snapshot:\n${JSON.stringify(snapshot)}`,
        FEEDBACK_SCHEMA,
      )
      res.json(JSON.parse(text))
    } else if (mode === 'lesson') {
      const { lesson, step, instructions, hint } = req.body
      const text = await ask(
        `I'm on the lesson "${lesson}", step "${step}".\n\nStep instructions:\n${instructions}\n\nThe app's check says: ${hint ?? 'not passing'}\n\n` +
          `Look at my current settings and explain in under 120 words what is off and exactly what to change. Use short paragraphs or "- " bullets and **bold** key values. No headings.\n\nSession snapshot:\n${JSON.stringify(snapshot)}`,
      )
      res.json({ text })
    } else {
      res.status(400).json({ error: 'Unknown mode' })
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: 'No valid Anthropic credentials. Set ANTHROPIC_API_KEY (or run `ant auth login`) and restart the server.' })
    } else if (e instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'Rate limited. Wait a moment and try again.' })
    } else if (e instanceof Anthropic.APIError) {
      res.status(502).json({ error: `Claude API error ${e.status}: ${e.message}` })
    } else if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      res.status(500).json({ error: `Coach needs Anthropic credentials: set ANTHROPIC_API_KEY (or run \`ant auth login\`) and restart \`npm run server\`. (${(e as Error).message})` })
    } else {
      res.status(500).json({ error: (e as Error).message })
    }
  }
})

app.listen(PORT, () => console.log(`Mixistance coach on http://localhost:${PORT} (model ${MODEL})`))
