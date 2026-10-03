// Whole-phrase pitch comparison (the idea of ToneMirror, github.com/antonsoo/tonemirror, MIT): my pitch line against
// a reference (the native voice, or the textbook tone shapes), each scaled to its own voice so a deep and a high voice
// compare by shape. Dynamic time warping lines them up (I may speak slower or pause), the leftover difference gives
// a 0–100 similarity, and rules on each syllable's stretch give plain-English tips. Pure: no audio here.

import type { Tone } from '../chinese/tones.ts'

/** Points per syllable when lines are resampled. */
export const PER_SYLLABLE = 12

/** Scale a pitch line (semitones) to its own range: 0 = its low (5th percentile), 1 = its high (95th). */
export function ownRange(semitones: number[]): number[] {
  if (semitones.length === 0) return []
  const sorted = [...semitones].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.05)]
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  const range = Math.max(hi - lo, 2) // a flat voice still has a 2-semitone "range", so it reads as flat, not noisy
  return semitones.map((s) => (s - lo) / range)
}

/** Dynamic time warping within a band: the cheapest way to pair up the points of a and b, in order. */
export function dtw(a: number[], b: number[], band = 0.25): { cost: number; path: [number, number][] } {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return { cost: Infinity, path: [] }
  const w = Math.max(Math.ceil(Math.max(n, m) * band), Math.abs(n - m))
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity))
  D[0][0] = 0
  for (let i = 1; i <= n; i++) {
    const centre = Math.round((i * m) / n)
    for (let j = Math.max(1, centre - w); j <= Math.min(m, centre + w); j++)
      D[i][j] = Math.abs(a[i - 1] - b[j - 1]) + Math.min(D[i - 1][j - 1], D[i - 1][j], D[i][j - 1])
  }
  const path: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1])
    const diag = D[i - 1][j - 1]
    const up = D[i - 1][j]
    const left = D[i][j - 1]
    if (diag <= up && diag <= left) {
      i--
      j--
    } else if (up <= left) i--
    else j--
  }
  path.reverse()
  return { cost: D[n][m] / path.length, path }
}

/** Mean difference (in voice ranges) → 0–100. 0.22 of a range off on average ≈ 37. */
export const similarity = (cost: number) => (Number.isFinite(cost) ? Math.round(100 * Math.exp(-cost / 0.22)) : 0)

export type PitchComparison = {
  similarity: number
  /** The reference, and my line warped onto its timeline (same length), both 0–1 of their own range. */
  reference: number[]
  mine: number[]
  tips: string[]
}

type Syl = { hanzi: string; spoken: Tone }

/**
 * Compare my pitch line (semitones, voiced frames in order) with a reference already scaled 0–1 whose syllables
 * take equal shares of its length. Null when I said too little to compare.
 */
export function comparePitch(mineSemitones: number[], reference: number[], syllables: Syl[]): PitchComparison | null {
  if (mineSemitones.length < 8 || reference.length < 2 || syllables.length === 0) return null
  const mine = ownRange(smooth(mineSemitones))
  const { cost, path } = dtw(reference, mine)
  // My line on the reference's timeline: the average of my points paired with each reference point.
  const sums = reference.map(() => [0, 0])
  for (const [r, m] of path) {
    sums[r][0] += mine[m]
    sums[r][1]++
  }
  const warped = sums.map(([s, n], i) => (n ? s / n : reference[i]))
  return { similarity: similarity(cost), reference, mine: warped, tips: pitchTips(reference, warped, syllables) }
}

/** Up to two tips, worst syllable first: where my line went the wrong way, or sat clearly too high or low. */
export function pitchTips(reference: number[], mine: number[], syllables: Syl[]): string[] {
  const n = syllables.length
  const per = reference.length / n
  const found: { badness: number; tip: string }[] = []
  syllables.forEach((s, k) => {
    if (s.spoken === 5) return // neutral tones vary with the tone before: not judged
    const from = Math.floor(k * per)
    const to = Math.max(from + 1, Math.floor((k + 1) * per) - 1)
    const refMove = reference[to] - reference[from]
    const myMove = mine[to] - mine[from]
    const level = avg(mine.slice(from, to + 1)) - avg(reference.slice(from, to + 1))
    const where = `On ${s.hanzi}`
    if (refMove < -0.3 && myMove > -0.1) found.push({ badness: Math.abs(refMove - myMove), tip: `${where}, let your pitch fall: start high and drop.` })
    else if (refMove > 0.3 && myMove < 0.1) found.push({ badness: Math.abs(refMove - myMove), tip: `${where}, your pitch should rise towards the end.` })
    else if (Math.abs(refMove) < 0.15 && Math.abs(myMove) > 0.35) found.push({ badness: Math.abs(myMove), tip: `${where}, hold your pitch level (it ${myMove > 0 ? 'rose' : 'fell'}).` })
    else if (level > 0.3) found.push({ badness: level, tip: `${where}, start lower: it should sit ${s.spoken === 3 ? 'low (tone 3)' : 'lower than you said it'}.` })
    else if (level < -0.3) found.push({ badness: -level, tip: `${where}, pitch it higher${s.spoken === 1 ? ': tone 1 stays high' : ''}.` })
  })
  return found.sort((a, b) => b.badness - a.badness).slice(0, 2).map((f) => f.tip)
}

/** The textbook reference for a phrase: each syllable's tone shape (a low "half third" mid-phrase), 0–1. */
export function textbookReference(syllables: Syl[], shape: (tone: Tone, half: boolean) => number[]): number[] {
  return syllables.flatMap((s, i) => resampleTo(shape(s.spoken, s.spoken === 3 && i < syllables.length - 1), PER_SYLLABLE))
}

export function resampleTo(values: number[], n: number): number[] {
  if (values.length === 0) return []
  if (values.length === 1) return Array(n).fill(values[0])
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (values.length - 1)
    const lo = Math.floor(x)
    const hi = Math.min(lo + 1, values.length - 1)
    return values[lo] + (values[hi] - values[lo]) * (x - lo)
  })
}

const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0)

/** Median of 5: pitch trackers jump about; this keeps the shape. */
function smooth(v: number[]): number[] {
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b)
    return w[Math.floor(w.length / 2)]
  })
}
