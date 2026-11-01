import { create } from 'zustand'
import { engine } from '../audio/engine'
import { DEMO_BPM, generateDemoStems } from '../audio/demoStems'
import { DEFAULT_EQ, type EqBand } from '../dsp/biquad'
import { DEFAULT_COMP, type CompressorParams } from '../dsp/compressorCore'
import { SEND_OFF_DB, type ChannelState, type MixState } from './types'

const PALETTE = ['#f97316', '#eab308', '#84cc16', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e']
const SESSIONS_KEY = 'mixistance.sessions'

export function newChannel(id: string, name: string, color: string, extra: Partial<ChannelState> = {}): ChannelState {
  return {
    id, name, color,
    gainDb: 0, pan: 0, faderDb: -6, mute: false, solo: false,
    eq: DEFAULT_EQ.map((b) => ({ ...b })), eqOn: true,
    comp: { ...DEFAULT_COMP }, compOn: false,
    reverbSendDb: SEND_OFF_DB, delaySendDb: SEND_OFF_DB,
    ...extra,
  }
}

export const INITIAL_MIX: MixState = {
  bpm: DEMO_BPM,
  channels: [],
  masterDb: 0,
  reverbDecay: 1.8,
  reverbReturnDb: -6,
  delayBeats: 0.75,
  delayFeedback: 0.3,
  delayReturnDb: -8,
}

interface Store {
  mix: MixState
  selectedId?: string
  loaded: boolean
  select(id: string): void
  setMix(p: Partial<MixState>): void
  setChannel(id: string, p: Partial<ChannelState>): void
  setEqBand(id: string, index: number, p: Partial<EqBand>): void
  setComp(id: string, p: Partial<CompressorParams>): void
  loadDemo(): Promise<void>
  addFiles(files: File[]): Promise<void>
  removeChannel(id: string): void
  /** Replace parameters for channels that exist (sessions don't store audio). */
  applySession(mix: MixState): void
}

export const useStore = create<Store>((set, get) => {
  const mapChannel = (id: string, f: (c: ChannelState) => ChannelState) =>
    set((s) => ({ mix: { ...s.mix, channels: s.mix.channels.map((c) => (c.id === id ? f(c) : c)) } }))

  return {
    mix: INITIAL_MIX,
    loaded: false,
    select: (id) => set({ selectedId: id }),
    setMix: (p) => set((s) => ({ mix: { ...s.mix, ...p } })),
    setChannel: (id, p) => mapChannel(id, (c) => ({ ...c, ...p })),
    setEqBand: (id, index, p) =>
      mapChannel(id, (c) => ({ ...c, eq: c.eq.map((b, i) => (i === index ? { ...b, ...p } : b)) })),
    setComp: (id, p) => mapChannel(id, (c) => ({ ...c, comp: { ...c.comp, ...p } })),

    async loadDemo() {
      await engine.init()
      const fs = engine.ctx.sampleRate
      const stems = generateDemoStems(fs)
      const channels = stems.map((s) => {
        const buf = engine.ctx.createBuffer(1, s.data.length, fs)
        buf.copyToChannel(s.data as Float32Array<ArrayBuffer>, 0)
        engine.setBuffer(s.id, buf)
        return newChannel(s.id, s.name, s.color, { pan: s.pan, faderDb: s.faderDb })
      })
      set((st) => ({ mix: { ...st.mix, bpm: DEMO_BPM, channels }, selectedId: channels[0].id, loaded: true }))
    },

    async addFiles(files) {
      const added: ChannelState[] = []
      for (const f of files) {
        const buf = await engine.decode(await f.arrayBuffer())
        const id = `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        engine.setBuffer(id, buf)
        const n = get().mix.channels.length + added.length
        added.push(newChannel(id, f.name.replace(/\.[^.]+$/, '').slice(0, 14), PALETTE[n % PALETTE.length]))
      }
      set((s) => ({
        mix: { ...s.mix, channels: [...s.mix.channels, ...added] },
        selectedId: s.selectedId ?? added[0]?.id,
        loaded: true,
      }))
    },

    removeChannel(id) {
      engine.removeChannel(id)
      set((s) => {
        const channels = s.mix.channels.filter((c) => c.id !== id)
        return { mix: { ...s.mix, channels }, selectedId: s.selectedId === id ? channels[0]?.id : s.selectedId }
      })
    },

    applySession(saved) {
      set((s) => ({
        mix: {
          ...saved,
          channels: s.mix.channels.map((c) => {
            const m = saved.channels.find((x) => x.id === c.id)
            return m ? { ...m, id: c.id } : c
          }),
        },
      }))
    },
  }
})

// Push every state change into the audio graph.
useStore.subscribe((s, prev) => {
  if (s.mix !== prev.mix) engine.sync(s.mix)
})

// ---- Session persistence (parameters only; audio stays in memory) ----

export interface SavedSession {
  name: string
  savedAt: string
  mix: MixState
}

export function listSessions(): SavedSession[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveSession(name: string, mix: MixState) {
  const sessions = listSessions().filter((s) => s.name !== name)
  sessions.unshift({ name, savedAt: new Date().toISOString(), mix })
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 20)))
  } catch {
    /* storage unavailable; export still works */
  }
}

export function exportSession(mix: MixState) {
  const blob = new Blob([JSON.stringify({ app: 'mixistance', mix }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `mixistance-session-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
