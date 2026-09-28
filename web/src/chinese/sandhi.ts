// Spoken tones from written tones. Grading always compares against the spoken tone.
// Rules (docs/SPEC.md §3): 3+3 → 2+3 · 不 → bú before a 4th tone · 一 → yí before a 4th tone,
// yì before 1st–3rd, yī when counting or at the end of a word/phrase · neutral tones stay neutral.

import type { Tone } from './tones.ts'

export type SandhiSyllable = {
  hanzi: string
  written: Tone
  /** Last syllable of a multi-syllable word (e.g. the 一 in 统一 or 星期一). */
  wordFinal: boolean
}

// Numerals around 一 mean it is being counted or read as a digit (十一, 一二三, 第一).
// 百/千/万 are left out on purpose: 一百 is yìbǎi.
const NUMERALS = new Set([...'零〇一二三四五六七八九十两'])

/** One phrase at a time: callers split at punctuation, where tone sandhi doesn't carry across. */
export function spokenTones(phrase: SandhiSyllable[]): Tone[] {
  const spoken: Tone[] = phrase.map((s) => s.written)

  for (let i = 0; i < phrase.length; i++) {
    const { hanzi, written, wordFinal } = phrase[i]
    const next = phrase[i + 1]
    if (hanzi === '不' && written === 4 && next?.written === 4) spoken[i] = 2
    if (hanzi === '一' && written === 1 && next) {
      const prev = phrase[i - 1]
      const counting = prev?.hanzi === '第' || NUMERALS.has(prev?.hanzi ?? '') || NUMERALS.has(next.hanzi)
      if (counting || wordFinal) continue
      spoken[i] = next.written === 4 || next.written === 5 ? 2 : 4
    }
  }

  // 3+3 → 2+3: in a run of third tones, all but the last rise.
  for (let i = 0; i < spoken.length - 1; i++) {
    if (spoken[i] === 3 && spoken[i + 1] === 3) spoken[i] = 2
  }
  return spoken
}
