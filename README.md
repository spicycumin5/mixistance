# Mixistance

A browser-based studio for practising mixing: real-time EQ and compression you can hear, guided lessons on a deliberately flawed multitrack, ear-training drills, and an AI coach that critiques your mix.

## Run it

```bash
npm install
npm run dev          # app at http://localhost:5173
```

For the AI coach, run the API server in a second terminal with Anthropic credentials:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
npm run server       # http://localhost:8787, proxied at /api by Vite
```

The coach uses `claude-opus-5-5` by default. Set `MIXISTANCE_MODEL` to use another model, for example `claude-sonnet-5-5`, which is cheaper. Only numbers (settings, spectrum band averages, loudness) are sent. Audio never leaves the browser.

## What's inside

| Area | What you get |
| --- | --- |
| **Mixer** | Channel strips (trim, 6-band EQ, compressor, pan, fader, mute/solo, reverb and delay sends) and a master strip with an EBU R128 loudness meter (momentary, short-term, integrated, true peak) |
| **EQ** | HPF, low shelf, 2 peaking bands, high shelf, LPF. Drag nodes on the curve over a live pre/post analyzer |
| **Compressor** | Feed-forward VCA-style design with a soft knee, a live transfer curve and a gain-reduction meter, plus presets that explain themselves |
| **Level-matched A/B** | Loudness-matches each processor's output to its input, so you judge tone and dynamics instead of volume |
| **Reference track** | Load a commercial track, trim its level to match yours, and flip between them |
| **Lessons** | 7 guided lessons (balance, HPF, low-mid mud, harsh vocal, vocal comp, drum punch, depth). Each step checks your settings live |
| **Ear training** | Frequency ID (4 levels), EQ match, compression detection (on/off, attack, ratio), and level discrimination down to 0.5 dB. Progress is stored locally |
| **AI coach** | Prioritised critique plus one-click "Try it" suggestions you can undo, and "why isn't this passing?" help inside lessons |
| **Sessions** | Save and load settings in the browser, or export/import them as JSON |

The demo multitrack is generated in code, so it is royalty-free. It has built-in problems to fix: a boomy kick, inconsistent snare hits, brittle hats, a 250 Hz bump in the bass, muddy keys, and a vocal with a 3.5 kHz resonance and uneven dynamics.

## Develop

```bash
npm test        # DSP + drill unit tests (compressor curve and timing, EBU loudness vectors, EQ math)
npm run build   # type-check and production build
```

- `src/dsp/`: pure DSP (compressor, loudness, biquad math) shared by AudioWorklets and tests
- `src/audio/`: Web Audio graph (engine, channel strips, insert slots, FX, drill player, demo stems)
- `src/training/`: lesson definitions, drill logic, progress
- `src/ui/`: React components
- `server/`: Claude-backed coach API
