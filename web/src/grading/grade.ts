// Speaking grading, shared by read-aloud, shadowing and Tone Dojo (docs/SPEC.md §5).
// Pure logic: align Azure's word results to the reference text, then give each syllable a status.

import { isHan, type Tone } from '../chinese/tones.ts'

export type Status = 'ok' | 'minor' | 'wrong'

/** One word as Azure Pronunciation Assessment reports it (times in ms). */
export type AzureWord = {
  word: string
  accuracy: number
  errorType: string
  offset: number
  duration: number
  /** Per-syllable scores when Azure gives one per character. */
  syllables?: { accuracy: number; offset: number; duration: number }[]
}

/** What the tone model says about one syllable (M4). */
export type ToneGuess = { tone: Tone; confidence: number }

export type CharResult = {
  hanzi: string
  /** null when Azure didn't hear this character at all (omission). */
  accuracy: number | null
  errorType: string
  offset: number | null
  duration: number | null
}

export const MINOR_BELOW = 80
export const WRONG_BELOW = 60
export const CONFIDENT = 0.7

/**
 * Merge Azure accuracy and (optionally) the tone model into ok · minor · wrong:
 * wrong = accuracy < 60, omitted, or a confidently wrong tone; minor = accuracy 60–79 or an unsure tone.
 */
export function statusFor(accuracy: number | null, spokenTone?: Tone, guess?: ToneGuess | null): Status {
  if (accuracy === null || accuracy < WRONG_BELOW) return 'wrong'
  if (guess && spokenTone && guess.tone !== spokenTone) return guess.confidence >= CONFIDENT ? 'wrong' : 'minor'
  if (accuracy < MINOR_BELOW) return 'minor'
  if (guess && guess.confidence < CONFIDENT) return 'minor'
  return 'ok'
}

/**
 * Line Azure's recognised characters up with the reference text (longest common subsequence), so results
 * from several utterances, and any skipped or extra words, land on the right characters.
 */
export function alignToReference(reference: string, words: AzureWord[]): CharResult[] {
  const ref = [...reference].filter(isHan)
  const heard: Omit<CharResult, 'hanzi'>[] = []
  const heardChars: string[] = []
  for (const w of words) {
    if (w.errorType === 'Omission') continue // Azure marks words it expected but didn't hear: they have no audio
    const chars = [...w.word].filter(isHan)
    const perSyllable = w.syllables?.length === chars.length ? w.syllables : null
    chars.forEach((c, i) => {
      heardChars.push(c)
      const s = perSyllable?.[i]
      heard.push({
        accuracy: s?.accuracy ?? w.accuracy,
        errorType: w.errorType,
        offset: s?.offset ?? w.offset + (w.duration / chars.length) * i,
        duration: s?.duration ?? w.duration / chars.length,
      })
    })
  }

  // lcs[i][j] = LCS length of ref[i..] and heardChars[j..]
  const n = ref.length
  const m = heardChars.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = ref[i] === heardChars[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const out: CharResult[] = []
  let j = 0
  for (let i = 0; i < n; i++) {
    while (j < m && ref[i] !== heardChars[j] && lcs[i][j + 1] >= lcs[i + 1][j]) j++ // skip extra words I said
    if (j < m && ref[i] === heardChars[j]) out.push({ hanzi: ref[i], ...heard[j++] })
    else out.push({ hanzi: ref[i], accuracy: null, errorType: 'Omission', offset: null, duration: null })
  }
  return out
}

export type Scores = { accuracy: number; fluency: number; completeness: number }

/** Totals: accuracy over the characters I said, completeness = share said, fluency from Azure's utterances. */
export function totals(chars: CharResult[], fluency: number): Scores {
  const said = chars.filter((c) => c.accuracy !== null)
  const accuracy = said.length ? said.reduce((sum, c) => sum + (c.accuracy ?? 0), 0) / said.length : 0
  return {
    accuracy: Math.round(accuracy),
    fluency: Math.round(fluency),
    completeness: chars.length ? Math.round((said.length / chars.length) * 100) : 0,
  }
}
