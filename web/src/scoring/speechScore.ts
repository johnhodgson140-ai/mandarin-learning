// Score what I said, syllable by syllable, 1–100: sounds from the browser recogniser (or Azure when there's
// a key), tones from my tone model (once calibrated).

import { pinyin } from 'pinyin-pro'
import type { Recording } from '../audio/recorder.ts'
import type { Syllable } from '../chinese/tokens.ts'
import { isHan } from '../chinese/tones.ts'
import type { CharResult } from '../grading/grade.ts'
import { learnVoice, segmentTones, syllableTones, type SyllableTone } from '../services/tone.ts'
import { log } from '../debug/log.ts'
import { bestAlternative, combine, soundScore, type SyllableScore } from './score.ts'

/** `soundsChecked`: false when neither Azure nor the browser recogniser could check the sounds (tone only). */
export type SpeechScore = { syllables: SyllableScore[]; overall: number; tones: (SyllableTone | null)[]; soundsChecked: boolean; wav: Blob }

/** Tone-less pinyin of each character the recogniser wrote. */
function heardSyllables(text: string): string[] {
  const chars = [...text].filter(isHan).join('')
  return chars ? (pinyin(chars, { type: 'array', toneSandhi: false, toneType: 'none' }) as string[]) : []
}

export async function scoreSpeech(syllables: Syllable[], rec: Recording, azure: CharResult[] | null = null): Promise<SpeechScore> {
  await learnVoice(rec.wav).catch(() => {})
  // Tones: cut out with Azure's timings when we have them, else find the syllables on the device.
  const tones: (SyllableTone | null)[] | null = azure ? await syllableTones(rec.wav, azure) : await segmentTones(rec.wav, syllables.length)

  // Sounds: Azure's accuracy, else how well the recogniser's best guess matches, else no sound check.
  let heard: (string | null)[] | null = null
  if (!azure && rec.heard?.length) heard = bestAlternative(syllables.map((s) => s.pinyin), rec.heard.map(heardSyllables))

  const scored = syllables.map((s, i) => {
    const sound = azure ? (azure[i]?.accuracy ?? 0) : heard ? soundScore(s.pinyin, heard[i]) : null
    return combine(sound, tones?.[i]?.probs ?? null, s.spoken, heard?.[i] ?? null)
  })
  const counted = scored.filter((s) => s.checked)
  const overall = counted.length ? Math.round(counted.reduce((sum, s) => sum + s.score, 0) / counted.length) : 0
  log('scored', { syllables: syllables.length, overall, tones: tones ? tones.filter(Boolean).length : 0, sounds: azure ? 'azure' : heard ? 'recogniser' : 'none' })
  return { syllables: scored, overall, tones: tones ?? syllables.map(() => null), soundsChecked: azure !== null || heard !== null, wav: rec.wav }
}
