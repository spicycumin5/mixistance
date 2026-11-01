// Guided mix lessons on the demo multitrack. Each step's `check` runs live against
// the mix state, so the learner gets immediate confirmation.

import type { EqBand } from '../../dsp/biquad'
import { SEND_OFF_DB, type ChannelState, type MixState } from '../../state/types'

export interface CheckCtx {
  mix: MixState
  ch: (id: string) => ChannelState | undefined
  /** Deepest compressor GR on a channel over the last ~3 s (dB). */
  gr: (id: string) => number
  /** Master meter readings. */
  master: { truePeakDb: number; integrated: number; shortTerm: number }
  playing: boolean
}

export interface CheckResult {
  pass: boolean
  hint?: string
}

export interface LessonStep {
  title: string
  body: string
  focus?: string // channel to select
  check?: (c: CheckCtx) => CheckResult
}

export interface Lesson {
  id: string
  title: string
  topic: 'Balance' | 'EQ' | 'Compression' | 'Space' | 'Finishing'
  minutes: number
  summary: string
  steps: LessonStep[]
}

const ok = (pass: boolean, hint?: string): CheckResult => ({ pass, hint: pass ? undefined : hint })
const peaks = (c: ChannelState | undefined) => c?.eq.filter((b) => b.enabled && b.type === 'peaking') ?? []
const bandIn = (bands: EqBand[], lo: number, hi: number, pred: (b: EqBand) => boolean) =>
  bands.some((b) => b.freq >= lo && b.freq <= hi && pred(b))
const hpf = (c: ChannelState | undefined) => c?.eq.find((b) => b.type === 'highpass')

export const LESSONS: Lesson[] = [
  {
    id: 'static-balance',
    title: 'Static balance & headroom',
    topic: 'Balance',
    minutes: 8,
    summary: 'Most of a great mix is just the faders. Build a balance with no processing, with headroom left for everything after.',
    steps: [
      {
        title: 'Start from silence',
        body: 'Pros often pull every fader down and build the mix up one element at a time. Turn **all faders down to -30 dB or lower**, except the kick. Leave every EQ and compressor out for now.',
        check: ({ mix }) =>
          ok(mix.channels.filter((c) => c.id !== 'kick').every((c) => c.faderDb <= -30), 'Some non-kick faders are still above -30 dB.'),
      },
      {
        title: 'Anchor the kick',
        body: 'Press play. Set the **kick so the master peaks around -10 to -8 dBFS** on its own. That leaves room for everything else to stack up without clipping. Watch the master meter, not the channel meter.',
        focus: 'kick',
        check: ({ ch }) => ok((ch('kick')?.faderDb ?? -99) > -14 && (ch('kick')?.faderDb ?? 0) < 0, 'Kick fader should sit somewhere between -14 and 0 dB for this stem.'),
      },
      {
        title: 'Add the low end, then the backbeat',
        body: 'Bring up the **bass** until it feels like one instrument with the kick: on small speakers you should still sense the bass notes. Then bring the **snare** up until it hits as hard as the kick. Keep checking the master: if it creeps past -6 dBFS, pull everything down together.',
        check: ({ ch }) => ok((ch('bass')?.faderDb ?? -99) > -25 && (ch('snare')?.faderDb ?? -99) > -25, 'Bring both bass and snare up above -25 dB.'),
      },
      {
        title: 'Vocal first, then fill around it',
        body: 'The vocal is the song. Bring the **vox** in so every word is clear, then bring **keys** up only until you would miss them if they were muted. Finally tuck the **hats** in: they should add motion without drawing attention. A good test is to mute a part. If the mix suddenly feels empty, it was at the right level.',
        check: ({ ch }) => {
          const v = ch('vox')?.faderDb ?? -99, k = ch('keys')?.faderDb ?? -99, h = ch('hats')?.faderDb ?? -99
          return ok(v > -25 && k > -40 && h > -40 && k < v, 'Have vox, keys and hats all audible, with keys sitting below the vocal.')
        },
      },
      {
        title: 'Check your headroom',
        body: 'Play the whole section. A mix headed to mastering typically has **true peaks between about -6 and -3 dBTP**. If you are clipping, do not pull the master down; lower the channel faders together. The master fader should stay at 0 dB.',
        check: ({ master, mix, playing }) =>
          ok(playing && master.truePeakDb < -3 && master.truePeakDb > -12 && Math.abs(mix.masterDb) < 0.5,
            playing ? 'Aim for true peak between -12 and -3 dBTP with the master fader at 0 dB.' : 'Press play so the meters can read.'),
      },
    ],
  },
  {
    id: 'hpf',
    title: 'High-pass filters: clean the low end',
    topic: 'EQ',
    minutes: 5,
    summary: 'Every track carries low-frequency junk that adds up to mud. Filter it from everything that is not the kick or bass.',
    steps: [
      {
        title: 'Why filter?',
        body: 'Keys, hats and vocals all contain low-frequency energy you cannot hear in solo, but it **stacks up** across tracks and eats headroom. The rule of thumb is that only the kick and bass should own the region below about 100 Hz. Turn on band 1 (**HPF**) to start.',
      },
      {
        title: 'Hats: be aggressive',
        body: 'Select **Hats** and enable the HPF. Sweep it up until the hats start to thin out, then back off a touch. On hats this is often **300-600 Hz**.',
        focus: 'hats',
        check: ({ ch }) => { const f = hpf(ch('hats')); return ok(!!f?.enabled && f.freq >= 250, 'Enable the hats HPF and set it to 250 Hz or higher.') },
      },
      {
        title: 'Keys: make room for the bass',
        body: 'Select **Keys**. The pad has low octave notes that blur with the bass. High-pass around **120-200 Hz**. Solo it and you might think it sounds thin, but listen in the mix: the bass suddenly gets clearer.',
        focus: 'keys',
        check: ({ ch }) => { const f = hpf(ch('keys')); return ok(!!f?.enabled && f.freq >= 100 && f.freq <= 300, 'Keys HPF between 100 and 300 Hz.') },
      },
      {
        title: 'Vocal and snare',
        body: 'On the **vox**, an HPF around **80-120 Hz** removes rumble and mic-stand thumps. On the **snare**, around **60-100 Hz** keeps the body but clears room for the kick. Leave the **kick and bass** unfiltered, or at most 20-30 Hz for subsonic cleanup.',
        check: ({ ch }) => {
          const v = hpf(ch('vox')), s = hpf(ch('snare')), k = hpf(ch('kick')), b = hpf(ch('bass'))
          const lowEndSafe = (f?: EqBand) => !f?.enabled || f.freq <= 40
          return ok(!!v?.enabled && v.freq >= 60 && !!s?.enabled && s.freq >= 50 && lowEndSafe(k) && lowEndSafe(b),
            'Filter vox (60 Hz+) and snare (50 Hz+), and keep kick/bass HPFs off or at 40 Hz or below.')
        },
      },
    ],
  },
  {
    id: 'mud',
    title: 'Clearing the low-mids',
    topic: 'EQ',
    minutes: 7,
    summary: 'The 200-500 Hz region is where mixes get muddy. Find the build-up on bass and keys, and carve space with subtractive EQ.',
    steps: [
      {
        title: 'The sweep technique',
        body: 'Select **Bass**. Take band 3 (Lo-Mid), boost it **+10 dB with a narrow Q (~4)**, and slowly sweep from 150 to 500 Hz. Listen for where it sounds boxiest and most "honky". On this bass it is around **250 Hz**. A boost-and-sweep exaggerates problems so you can find them.',
        focus: 'bass',
      },
      {
        title: 'Turn the boost into a cut',
        body: 'Once you have found the frequency, flip the gain to a **cut of -3 to -6 dB** and widen the Q a little (1.5-3). Toggle EQ in and out with **Level-matched A/B** on. The bass should sound tighter, not quieter.',
        focus: 'bass',
        check: ({ ch }) => ok(bandIn(peaks(ch('bass')), 180, 350, (b) => b.gainDb <= -2.5), 'Put a cut of at least -2.5 dB on the bass between 180 and 350 Hz.'),
      },
      {
        title: 'Complementary EQ on the keys',
        body: 'Now the **Keys**. The pad also piles up in the low-mids. Cut **2-5 dB somewhere in 250-500 Hz** with a broad Q (~1). This is "complementary EQ": each instrument gets its own slot instead of all of them fighting over the same range.',
        focus: 'keys',
        check: ({ ch }) => ok(bandIn(peaks(ch('keys')), 220, 550, (b) => b.gainDb <= -2), 'Cut at least -2 dB on the keys between 220 and 550 Hz.'),
      },
      {
        title: 'Give the kick its own space',
        body: 'Kick and bass fight around **50-100 Hz**. Decide who owns the very bottom. Here, let the kick have the sub punch: on the **bass**, dip about **2 dB around 60-80 Hz** using the low shelf or a peak. Listen for the kick to pop out on every hit.',
        focus: 'bass',
        check: ({ ch }) => {
          const b = ch('bass')
          const shelf = b?.eq.find((x) => x.type === 'lowshelf')
          const dip = (shelf?.enabled && shelf.gainDb <= -1 && shelf.freq <= 120) || bandIn(peaks(b), 45, 110, (x) => x.gainDb <= -1)
          return ok(!!dip, 'Dip 1 dB or more on the bass below about 110 Hz.')
        },
      },
    ],
  },
  {
    id: 'harsh-vocal',
    title: 'Taming a harsh vocal',
    topic: 'EQ',
    minutes: 6,
    summary: 'Find and notch a narrow resonance in the presence range without dulling the vocal, then add air the musical way.',
    steps: [
      {
        title: 'Hear the problem',
        body: 'Solo the **Vox**. There is a piercing, nasal ringing in the upper mids that gets tiring fast. Harshness usually lives at **2.5-5 kHz**, where our ears are most sensitive.',
        focus: 'vox',
      },
      {
        title: 'Surgical notch',
        body: 'Use band 4 (Hi-Mid). Boost-and-sweep narrow (Q 5+) between 2.5 and 5 kHz until it jumps out. Then **cut 3-6 dB with a narrow Q (2-6)**. Narrow cuts remove resonances; wide cuts remove tone. Here you want surgical.',
        focus: 'vox',
        check: ({ ch }) => ok(bandIn(peaks(ch('vox')), 3000, 4200, (b) => b.gainDb <= -3 && b.q >= 2), 'A cut of -3 dB or more, Q 2 or higher, between 3 and 4.2 kHz.'),
      },
      {
        title: 'Add air, not harshness',
        body: 'Pro vocals often get a **high shelf boost of +1 to +3 dB around 8-12 kHz**. This adds "air" above the harsh zone. Because you removed the resonance first, the boost reads as expensive rather than brittle.',
        focus: 'vox',
        check: ({ ch }) => {
          const hs = ch('vox')?.eq.find((b) => b.type === 'highshelf')
          return ok(!!hs?.enabled && hs.gainDb >= 1 && hs.gainDb <= 5 && hs.freq >= 7000, 'High shelf +1 to +5 dB at 7 kHz or above.')
        },
      },
    ],
  },
  {
    id: 'vocal-comp',
    title: 'Vocal compression',
    topic: 'Compression',
    minutes: 8,
    summary: 'Even out a dynamic performance so every word sits at the same place in the mix.',
    steps: [
      {
        title: 'Diagnose',
        body: 'Play the song and watch the **Vox** meter. Some phrases are whispers and some jump out. With a fader alone you can only fix one or the other. Turn the vocal compressor **In**.',
        focus: 'vox',
        check: ({ ch }) => ok(!!ch('vox')?.compOn, 'Engage the vox compressor (CMP).'),
      },
      {
        title: 'Ratio and threshold',
        body: 'Start with a **ratio of 3:1 to 4:1**. Lower the threshold until the loud phrases show about **4-8 dB of gain reduction** while the quiet ones barely move the meter. Watch the dot on the transfer curve cross the threshold line.',
        focus: 'vox',
        check: ({ ch, gr, playing }) => {
          const c = ch('vox')?.comp
          return ok(playing && !!c && c.ratio >= 2.5 && c.ratio <= 6 && gr('vox') >= 3 && gr('vox') <= 10,
            playing ? 'Ratio 2.5-6:1 and peaks showing 3-10 dB of GR.' : 'Press play so the gain-reduction meter can read.')
        },
      },
      {
        title: 'Attack and release',
        body: 'Attack decides whether the start of each word gets through. **3-15 ms** controls the vocal while keeping consonants intelligible. Release should let the GR meter recover between phrases: **60-200 ms** "breathes" with the singer. If the vocal pumps, lengthen the release.',
        focus: 'vox',
        check: ({ ch }) => { const c = ch('vox')?.comp; return ok(!!c && c.attackMs >= 2 && c.attackMs <= 20 && c.releaseMs >= 50 && c.releaseMs <= 250, 'Attack 2-20 ms and release 50-250 ms.') },
      },
      {
        title: 'Makeup and A/B honestly',
        body: 'Add makeup gain so the vocal sits back where it was, then turn on **Level-matched A/B** and toggle the comp. The compressed version should sound **steadier and more upfront**, not just louder. If you cannot hear a difference at matched level, you might not need that much compression.',
        focus: 'vox',
        check: ({ ch }) => ok((ch('vox')?.comp.makeupDb ?? 0) >= 1, 'Add at least 1 dB of makeup gain.'),
      },
    ],
  },
  {
    id: 'snare-punch',
    title: 'Drum punch with attack & release',
    topic: 'Compression',
    minutes: 6,
    summary: 'Use a slow attack to shape transients, the opposite of controlling level.',
    steps: [
      {
        title: 'Inconsistent snare',
        body: 'Solo the **Snare**. The hits vary wildly in level. Turn the compressor on and set **ratio 4:1 or higher**, with the threshold low enough to see 4-8 dB of GR on the loud hits.',
        focus: 'snare',
        check: ({ ch }) => { const c = ch('snare'); return ok(!!c?.compOn && c.comp.ratio >= 4, 'Snare comp in, ratio 4:1 or higher.') },
      },
      {
        title: 'Open the attack',
        body: 'Set attack to **0.5 ms**: the snare goes flat and lifeless, because the crack gets squashed. Now slowly raise it to **10-40 ms**. The initial crack sneaks through before the compressor clamps down, so the snare gets **punchier** even though you are compressing. This is the most important compression concept to internalize.',
        focus: 'snare',
        check: ({ ch }) => { const a = ch('snare')?.comp.attackMs ?? 0; return ok(a >= 8 && a <= 50, 'Snare attack between 8 and 50 ms.') },
      },
      {
        title: 'Release in time',
        body: 'Set release so the GR meter is back to zero **before the next hit**. At 96 BPM, a 16th note is about 156 ms. Try **40-120 ms**. Too long and the next hit gets squashed; too short and it can sound grainy on sustained sounds.',
        focus: 'snare',
        check: ({ ch }) => { const r = ch('snare')?.comp.releaseMs ?? 0; return ok(r >= 30 && r <= 150, 'Snare release between 30 and 150 ms.') },
      },
    ],
  },
  {
    id: 'depth',
    title: 'Depth with reverb & delay',
    topic: 'Space',
    minutes: 6,
    summary: 'Use sends, not inserts, to place elements front-to-back while keeping the low end dry.',
    steps: [
      {
        title: 'Why sends?',
        body: 'Every channel feeds one shared reverb, which glues everything into the **same room**. The reverb return already has a high-pass at 180 Hz so it never muddies the bass. Set the master **reverb decay to 1.2-2.5 s** for this tempo.',
        check: ({ mix }) => ok(mix.reverbDecay >= 1.2 && mix.reverbDecay <= 2.5, 'Reverb decay between 1.2 and 2.5 s.'),
      },
      {
        title: 'Vocal: present but in a space',
        body: 'Send the **vox** to reverb around **-20 to -12 dB**. Raise it until you clearly hear the room, then back off until you *only notice it when it is muted*. A tempo-synced dotted-8th **delay** (around -24 dB) adds width without washing out the words.',
        focus: 'vox',
        check: ({ ch }) => { const v = ch('vox'); return ok(!!v && v.reverbSendDb >= -26 && v.reverbSendDb <= -8, 'Vox reverb send between -26 and -8 dB.') },
      },
      {
        title: 'Push things back',
        body: 'More reverb plus less direct level means **further away**. Give the **keys** more reverb than the vocal (-16 to -6 dB), so they sit behind it. Keep **kick and bass dry**: reverb on low-end instruments smears the groove.',
        check: ({ ch }) => {
          const k = ch('keys'), kick = ch('kick'), b = ch('bass')
          return ok(!!k && k.reverbSendDb >= -18 && (kick?.reverbSendDb ?? SEND_OFF_DB) <= -40 && (b?.reverbSendDb ?? SEND_OFF_DB) <= -40,
            'Keys reverb send of -18 dB or more, with kick and bass sends at -40 dB or off.')
        },
      },
    ],
  },
]
