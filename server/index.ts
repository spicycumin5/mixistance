// Local development server for the mix coach. In production on Vercel, api/feedback.ts
// serves the same route with the same logic (server/coach.ts).

import express from 'express'
import { handleFeedback, MODEL } from './coach'

const PORT = Number(process.env.PORT ?? 8787)

const app = express()
app.use(express.json({ limit: '1mb' }))

app.post('/api/feedback', async (req, res) => {
  const r = await handleFeedback(req.body)
  res.status(r.status).json(r.body)
})

app.listen(PORT, () => console.log(`Mixistance coach on http://localhost:${PORT} (model ${MODEL})`))
