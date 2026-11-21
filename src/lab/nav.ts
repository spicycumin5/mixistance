// Lets other parts of the app (e.g. the mixer's compressor) open a lab with settings.

import { create } from 'zustand'
import type { Params } from './types'

interface LabNav {
  request: { lab: string; params?: Params } | null
  open(lab: string, params?: Params): void
  consume(): { lab: string; params?: Params } | null
}

export const useLabNav = create<LabNav>((set, get) => ({
  request: null,
  open: (lab, params) => set({ request: { lab, params } }),
  consume: () => {
    const r = get().request
    if (r) set({ request: null })
    return r
  },
}))
