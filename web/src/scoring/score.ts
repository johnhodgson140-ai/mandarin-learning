// Free pronunciation scoring: sounds (from speech recognition, or Azure) + tone (from my tone model) → 1–100.
// Pure logic, plus plain-English tips for what went wrong. No API needed.

import type { Tone } from '../chinese/tones.ts'
import { toneless } from '../chinese/tones.ts'
import type { Status } from '../grading/grade.ts'

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']

/** "zhāng" → { initial: "zh", final: "ang" } (tone marks removed; y/w count as initials). */
export function splitSyllable(pinyin: string): { initial: string; final: string } {
  const plain = toneless(pinyin).replace(/v/g, 'ü')
  const initial = INITIALS.find((i) => plain.startsWith(i)) ?? ''
  return { initial, final: plain.slice(initial.length) }
}

/** How close the sounds were, 0–100: half for the initial, half for the final. */
export function soundScore(expected: string, heard: string | null): number {
  if (heard === null) return 0
  const e = splitSyllable(expected)
  const h = splitSyllable(heard)
  return (e.initial === h.initial ? 50 : 0) + (e.final === h.final ? 50 : 0)
}

export type SyllableScore = {
  score: number
  status: Status
  sound: number | null
  /** Probability my tone model gives to the right tone, 0–1 (null: no tone check). */
  tone: number | null
  heardPinyin: string | null
  heardTone: Tone | null
}

/**
 * Combine the parts. Neutral-tone syllables are judged on sound only. With both parts, sound and tone
 * count equally; with one part, that part is the score.
 */
const WRONG_TONE = 0.35
const WRONG_TONE_CAP = 50

export function combine(
  sound: number | null,
  toneProbs: number[] | null,
  spokenTone: Tone,
  heardPinyin: string | null = null,
): SyllableScore {
  const tone = toneProbs && spokenTone !== 5 ? toneProbs[spokenTone - 1] : null
  const heardTone = toneProbs ? ((toneProbs.indexOf(Math.max(...toneProbs)) + 1) as Tone) : null
  // The recogniser guesses words from context, so it "hears" the right word even with the wrong tone: when the
  // tone is checked it counts for more, and a clearly wrong tone can't score above amber-red.
  let raw = sound ?? (tone === null ? 1 : tone * 100)
  if (sound !== null && tone !== null) raw = 0.4 * sound + 0.6 * tone * 100
  if (tone !== null && heardTone !== spokenTone && tone < WRONG_TONE) raw = Math.min(raw, WRONG_TONE_CAP)
  const score = Math.max(1, Math.round(raw))
  return { score, status: statusOf(score), sound, tone, heardPinyin, heardTone }
}

export const statusOf = (score: number): Status => (score >= 80 ? 'ok' : score >= 60 ? 'minor' : 'wrong')

/** Green (100) → amber (70) → red (≤40), in the app's muted palette. */
export function scoreColour(score: number): string {
  const red = [0xb5, 0x52, 0x3f]
  const amber = [0xc8, 0x91, 0x3a]
  const green = [0x4f, 0x7f, 0x5f]
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  const s = Math.min(100, Math.max(40, score))
  const rgb = s < 70 ? mix(red, amber, (s - 40) / 30) : mix(amber, green, (s - 70) / 30)
  return `rgb(${rgb.join(' ')})`
}

const TONE_TIPS: Record<Tone, string> = {
  1: 'Tone 1 stays high and level: hold it like a sung note.',
  2: 'Tone 2 rises from the middle, like asking "what?"',
  3: 'Tone 3 goes low: start low and dip (mid-sentence, just stay low).',
  4: 'Tone 4 falls sharply from high to low, like a firm "no!"',
  5: 'Neutral tone is short and light.',
}

const SOUND_TIPS: Record<string, string> = {
  'zh/z': 'For zh, curl the tip of your tongue back; z is flat, behind the teeth.',
  'ch/c': 'For ch, curl the tongue back and add a puff of air; c is flat, behind the teeth.',
  'sh/s': 'For sh, curl the tongue back; s is flat, behind the teeth.',
  'x/sh': 'For x, keep the tongue flat and behind the lower teeth, smiling; sh is curled back.',
  'q/ch': 'For q, tongue flat behind the lower teeth, smiling, with a puff of air; ch is curled back.',
  'j/zh': 'For j, tongue flat behind the lower teeth, smiling; zh is curled back.',
  'r/l': 'For r, curl the tongue back without touching the roof of the mouth; l touches behind the teeth.',
  'n/l': 'n goes through the nose; l lets air pass the sides of the tongue.',
  'p/b': 'p has a strong puff of air; b has none.',
  't/d': 't has a strong puff of air; d has none.',
  'k/g': 'k has a strong puff of air; g has none.',
  'ü/u': 'For ü, say "ee" and round your lips without moving your tongue.',
  'ng/n': 'Endings: -ng is at the back of the mouth (like "sing"), -n at the front (like "sin").',
}

function soundTip(expected: string, heard: string): string | null {
  const pairKey = (a: string, b: string) => SOUND_TIPS[`${a}/${b}`] ?? SOUND_TIPS[`${b}/${a}`]
  const e = splitSyllable(expected)
  const h = splitSyllable(heard)
  if (e.initial !== h.initial) {
    const tip = pairKey(e.initial, h.initial)
    return `Heard "${h.initial || '(no consonant)'}" instead of "${e.initial || '(no consonant)'}". ${tip ?? ''}`.trim()
  }
  if (e.final !== h.final) {
    const nasal = (e.final.endsWith('ng') && h.final === e.final.slice(0, -1)) || (h.final.endsWith('ng') && e.final === h.final.slice(0, -1))
    const vowel = e.final.includes('ü') !== h.final.includes('ü')
    const tip = nasal ? SOUND_TIPS['ng/n'] : vowel ? SOUND_TIPS['ü/u'] : ''
    return `Heard "-${h.final}" instead of "-${e.final}". ${tip}`.trim()
  }
  return null
}

/** Plain-English tips for one syllable (empty when it was fine). */
export function tips(expectedPinyin: string, spokenTone: Tone, s: SyllableScore): string[] {
  const out: string[] = []
  if (s.sound === 0 && s.heardPinyin === null) out.push("Couldn't make out this sound: say it a bit more clearly.")
  else if (s.heardPinyin && s.sound !== null && s.sound < 100) {
    const tip = soundTip(expectedPinyin, s.heardPinyin)
    if (tip) out.push(tip)
  }
  if (s.tone !== null && s.tone < 0.6 && s.heardTone && s.heardTone !== spokenTone)
    out.push(`Sounded like tone ${s.heardTone === 5 ? '(neutral)' : s.heardTone}. ${TONE_TIPS[spokenTone]}`)
  return out
}

/**
 * Line up what the recogniser heard with what I meant to say, by sound (tone-less pinyin), so a
 * homophone (马 for 骂) still counts as the right sounds. Unmatched syllables between two matches are
 * paired in order (a substitution, e.g. "zi" for "zhi"); anything left over wasn't heard.
 */
export function alignSyllables(expected: string[], heard: string[]): (string | null)[] {
  const e = expected.map(toneless)
  const h = heard.map(toneless)
  const n = e.length
  const m = h.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = e[i] === h[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const out: (string | null)[] = Array(n).fill(null)
  let i = 0
  let j = 0
  let gapE: number[] = []
  let gapH: number[] = []
  const flushGap = () => {
    gapE.forEach((ei, k) => (out[ei] = k < gapH.length ? heard[gapH[k]] : null))
    gapE = []
    gapH = []
  }
  while (i < n || j < m) {
    if (i < n && j < m && e[i] === h[j]) {
      flushGap()
      out[i++] = heard[j++]
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) gapH.push(j++)
    else gapE.push(i++)
  }
  flushGap()
  return out
}

/** Pick the recogniser alternative that matches the most syllables. */
export function bestAlternative(expected: string[], alternatives: string[][]): (string | null)[] {
  let best: (string | null)[] = expected.map(() => null)
  let bestScore = -1
  for (const alt of alternatives) {
    const aligned = alignSyllables(expected, alt)
    const score = aligned.reduce((sum, h, i) => sum + (h !== null ? soundScore(expected[i], h) : 0), 0)
    if (score > bestScore) {
      best = aligned
      bestScore = score
    }
  }
  return best
}
