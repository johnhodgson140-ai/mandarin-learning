// Tone checker benchmark: synthetic speech with the things that go wrong on real voices, so changes to the
// tone model can be measured instead of guessed. Run: node ml/tone-bench.ts  (from the repo root)
//
// Each trial draws a speaker (male or female range), then distorts what they say the way real speech does:
// - speaking higher/lower than when calibrated (register offset) and with a narrower/wider range;
// - consonant "microprosody" (a pitch bump in the first ~30 ms of the vowel);
// - creaky voice at the bottom of tone 3 (octave halving and dropouts);
// - carry-over from the previous syllable, declination across a sentence, jitter and background noise.
// Not a substitute for real recordings: a guard against regressions and a way to compare ideas.

import { adaptProfile, calibrate, predict, TUNING } from '../web/src/tone/model.ts'
import { segmentSyllables } from '../web/src/tone/segment.ts'

const SR = 16000
let seed = 12345
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const between = (a: number, b: number) => a + (b - a) * rand()
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())

type Tone = 1 | 2 | 3 | 4 | 5
/** Chao-scale targets (1 = bottom, 5 = top of range). Citation forms and the mid-sentence half-third. */
const SHAPES: Record<string, number[]> = {
  t1: [4.6, 4.6, 4.5],
  t2: [3.2, 2.9, 3.4, 4.8],
  t3: [2.2, 1.2, 1.0, 1.6, 3.6],
  t3half: [2.1, 1.3, 1.0, 1.0],
  t4: [4.9, 4.5, 3.0, 1.4],
  t5: [2.8, 2.5],
}

type Speaker = { lo: number; hi: number }
const semis = (hz: number) => 12 * Math.log2(hz / 55)
const hzOf = (st: number) => 55 * 2 ** (st / 12)

/** Pitch (Hz) of a Chao value for a speaker, with register offset and range scaling (in semitones). */
function chaoHz(v: number, sp: Speaker, offset: number, scale: number): number {
  const lo = semis(sp.lo)
  const hi = semis(sp.hi)
  const mid = (lo + hi) / 2
  const st = mid + ((lo + ((v - 1) / 4) * (hi - lo)) - mid) * scale + offset
  return hzOf(st)
}

type Opts = { offset: number; scale: number; creak: number; micro: number; snr: number; carry: number | null; declineSt: number }

/** One syllable: consonant noise then a voiced vowel following `shape`. Returns samples and the vowel's last pitch. */
function syllable(shape: number[], ms: number, sp: Speaker, o: Opts): { samples: number[]; endHz: number } {
  const out: number[] = []
  const cons = Math.round(between(0.02, 0.06) * SR)
  for (let i = 0; i < cons; i++) out.push(gauss() * 0.03)
  const n = Math.round((ms / 1000) * SR)
  let phase = 0
  let endHz = 0
  const microSt = o.micro * between(-1, 2) // after voiceless consonants pitch usually starts a bit high
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const x = t * (shape.length - 1)
    const lo = Math.floor(x)
    const hi = Math.min(lo + 1, shape.length - 1)
    const v = shape[lo] + (shape[hi] - shape[lo]) * (x - lo)
    let hz = chaoHz(v, sp, o.offset - o.declineSt, o.scale)
    const ms_ = (i / SR) * 1000
    if (ms_ < 30) hz *= 2 ** ((microSt * (1 - ms_ / 30)) / 12)
    if (o.carry !== null && t < 0.2) hz = o.carry + (hz - o.carry) * (t / 0.2) // carry-over from the previous syllable
    hz *= 1 + gauss() * 0.004 // jitter
    endHz = hz
    // Creak: near the bottom of the range, sometimes halve the frequency or go aperiodic.
    const low = v < 1.4
    let sample: number
    if (low && rand() < o.creak) sample = gauss() * 0.15
    else {
      const f = low && o.creak > 0 && Math.floor(i / 160) % 3 === 0 ? hz / 2 : hz
      phase += (2 * Math.PI * f) / SR
      sample = 0
      for (let k = 1; k <= 8; k++) sample += Math.sin(k * phase) / k
      sample *= 0.35
    }
    const env = Math.min(1, i / 200, (n - i) / 200)
    out.push(sample * env)
  }
  return { samples: out, endHz }
}

function addNoise(samples: number[], snrDb: number): Float32Array {
  const power = samples.reduce((s, x) => s + x * x, 0) / samples.length
  const sd = Math.sqrt(power / 10 ** (snrDb / 10))
  return Float32Array.from(samples, (x) => x + gauss() * sd)
}

const speakers: Speaker[] = [
  { lo: 90, hi: 180 },
  { lo: 105, hi: 210 },
  { lo: 170, hi: 340 },
  { lo: 190, hi: 380 },
]

function calibrationFor(sp: Speaker) {
  const o: Opts = { offset: 0, scale: 1, creak: 0, micro: 0, snr: 35, carry: null, declineSt: 0 }
  return calibrate(
    (['t1', 't2', 't3', 't4'] as const).map((k) => addNoise(syllable(SHAPES[k], 400, sp, o).samples, 35)),
    SR,
  )
}

type Level = 'clean' | 'realistic' | 'hard'
function distort(level: Level): Omit<Opts, 'carry' | 'declineSt'> {
  if (level === 'clean') return { offset: 0, scale: 1, creak: 0, micro: 0, snr: 35 }
  if (level === 'realistic') return { offset: between(-2, 2), scale: between(0.7, 1.1), creak: between(0, 0.2), micro: 1, snr: between(18, 30) }
  return { offset: between(-3.5, 3.5), scale: between(0.5, 1.2), creak: between(0.1, 0.4), micro: 1.5, snr: between(10, 20) }
}

function wordTrial(level: Level): [Tone, Tone] {
  const sp = speakers[Math.floor(rand() * speakers.length)]
  const profile = profiles.get(sp)!
  const tone = (1 + Math.floor(rand() * 4)) as Tone
  const key = tone === 3 && rand() < 0.3 ? 't3half' : `t${tone}`
  const o = { ...distort(level), carry: null, declineSt: 0 }
  const audio = addNoise(syllable(SHAPES[key], between(220, 420), sp, o).samples, o.snr)
  return [tone, predict(audio, SR, profile).tone]
}

function sentenceTrial(level: Level, length: number): [Tone, Tone][] {
  const sp = speakers[Math.floor(rand() * speakers.length)]
  const profile = profiles.get(sp)!
  const d = distort(level)
  const tones: Tone[] = []
  const parts: number[] = Array.from({ length: Math.round(0.15 * SR) }, () => gauss() * 0.001)
  let carry: number | null = null
  const truth: { start: number; end: number }[] = []
  for (let i = 0; i < length; i++) {
    const tone = (1 + Math.floor(rand() * 4)) as Tone
    const start = parts.length
    tones.push(tone)
    // Mid-sentence third tone is usually the low half-third; at the end it's the full dip.
    const key = tone === 3 ? (i === length - 1 ? 't3' : 't3half') : `t${tone}`
    const { samples, endHz } = syllable(SHAPES[key], between(140, 260), sp, { ...d, carry, declineSt: level === 'clean' ? 0 : (i / length) * 1.5 })
    parts.push(...samples)
    truth.push({ start, end: parts.length })
    carry = endHz
    if (rand() < 0.15) parts.push(...Array.from({ length: Math.round(0.2 * SR) }, () => gauss() * 0.001))
  }
  parts.push(...Array.from({ length: Math.round(0.15 * SR) }, () => gauss() * 0.001))
  const audio = addNoise(parts, d.snr)
  const spans = process.env.ORACLE ? truth : segmentSyllables(audio, SR, length)
  const adapted = adaptProfile(profile, audio, SR, length)
  return spans.map((s, i) => [tones[i], predict(audio.subarray(s.start, s.end), SR, adapted, { neutralByLength: false }).tone])
}

const profiles = new Map(speakers.map((sp) => [sp, calibrationFor(sp)]))

function report(name: string, pairs: [Tone, Tone][]) {
  const byTone = [1, 2, 3, 4].map((t) => {
    const mine = pairs.filter(([e]) => e === t)
    return mine.length ? Math.round((100 * mine.filter(([e, g]) => e === g).length) / mine.length) : 0
  })
  const all = Math.round((1000 * pairs.filter(([e, g]) => e === g).length) / pairs.length) / 10
  console.log(`${name.padEnd(22)} ${String(all).padStart(5)}%   T1 ${byTone[0]}  T2 ${byTone[1]}  T3 ${byTone[2]}  T4 ${byTone[3]}`)
  if (process.env.CONFUSION) for (const t of [1, 2, 3, 4]) console.log(`   T${t} → ` + [1, 2, 3, 4, 5].map((g) => `${g}:${pairs.filter(([e, x]) => e === t && x === g).length}`).join(' '))
  return all
}

if (process.env.TUNE) Object.assign(TUNING, JSON.parse(process.env.TUNE))
const results: number[] = []
for (const level of ['clean', 'realistic', 'hard'] as Level[]) {
  seed = 1000 + level.length
  results.push(report(`words · ${level}`, Array.from({ length: 400 }, () => wordTrial(level))))
  seed = 2000 + level.length
  results.push(report(`sentences · ${level}`, Array.from({ length: 40 }, () => sentenceTrial(level, 8)).flat()))
}
console.log(`average ${Math.round((results.reduce((a, b) => a + b, 0) / results.length) * 10) / 10}%`)
