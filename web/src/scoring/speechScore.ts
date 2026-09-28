// Score what I said, syllable by syllable, 1–100: sounds from the browser recogniser (or Azure when there's
// a key), tones from my tone model (once calibrated).

import { pinyin } from 'pinyin-pro'
import type { Recording } from '../audio/recorder.ts'
import type { Syllable } from '../chinese/tokens.ts'
import { isHan } from '../chinese/tones.ts'
import type { CharResult } from '../grading/grade.ts'
import { evenSplitTones, syllableTones, type SyllableTone } from '../services/tone.ts'
import { bestAlternative, combine, soundScore, type SyllableScore } from './score.ts'

export type SpeechScore = { syllables: SyllableScore[]; overall: number; tones: (SyllableTone | null)[] }

/** Tone-less pinyin of each character the recogniser wrote. */
function heardSyllables(text: string): string[] {
  const chars = [...text].filter(isHan).join('')
  return chars ? (pinyin(chars, { type: 'array', toneSandhi: false, toneType: 'none' }) as string[]) : []
}

export async function scoreSpeech(syllables: Syllable[], rec: Recording, azure: CharResult[] | null = null): Promise<SpeechScore> {
  // Tones: cut out with Azure's timings when we have them; for short words, split the voiced part evenly.
  let tones: (SyllableTone | null)[] | null = null
  if (azure) tones = await syllableTones(rec.wav, azure)
  else if (syllables.length <= 4) tones = await evenSplitTones(rec.wav, syllables.length)

  // Sounds: Azure's accuracy, else how well the recogniser's best guess matches, else no sound check.
  let heard: (string | null)[] | null = null
  if (!azure && rec.heard?.length) heard = bestAlternative(syllables.map((s) => s.pinyin), rec.heard.map(heardSyllables))

  const scored = syllables.map((s, i) => {
    const sound = azure ? (azure[i]?.accuracy ?? 0) : heard ? soundScore(s.pinyin, heard[i]) : null
    return combine(sound, tones?.[i]?.probs ?? null, s.spoken, heard?.[i] ?? null)
  })
  const overall = scored.length ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 0
  return { syllables: scored, overall, tones: tones ?? syllables.map(() => null) }
}
