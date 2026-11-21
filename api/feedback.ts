// Vercel serverless function for the mix coach: POST /api/feedback.
// Set ANTHROPIC_API_KEY (and optionally MIXISTANCE_MODEL) in the Vercel project settings.

import { handleFeedback } from '../server/coach'

export async function POST(request: Request): Promise<Response> {
  const text = await request.text()
  if (text.length > 1_000_000) return Response.json({ error: 'Request too large' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const r = await handleFeedback(body)
  return Response.json(r.body, { status: r.status })
}
