// Grade one Tone Dojo word: Azure accuracy when there's a key, the tone model for the tones.

import type { DojoItem } from './dojo.ts'
import { alignToReference, statusFor, totals, type AttemptSyllable, type Status } from './grade.ts'
import { assess } from '../services/azure.ts'
import { newId, saveAttempt } from '../services/attempts.ts'
import { getKeys } from '../services/keys.ts'
import { evenSplitTones, syllableTones, type SyllableTone } from '../services/tone.ts'

export type WordResult = { statuses: Status[]; tones: (SyllableTone | null)[]; accuracy: (number | null)[] }

export async function gradeWord(item: DojoItem, wav: Blob): Promise<WordResult> {
  const syllables = item.token.syllables
  let accuracy: (number | null)[]
  let tones: (SyllableTone | null)[] | null
  let fluency = 0
  if (getKeys().azure) {
    const result = await assess(wav, item.word)
    const chars = alignToReference(item.word, result.words)
    accuracy = chars.map((c) => c.accuracy)
    tones = await syllableTones(wav, chars)
    fluency = result.fluency
  } else {
    // No Azure: the tone model alone, on the voiced part split evenly between the syllables.
    accuracy = syllables.map(() => null)
    tones = await evenSplitTones(wav, syllables.length)
  }
  const toneList = tones ?? syllables.map(() => null)
  const statuses = syllables.map((s, i) =>
    statusFor(getKeys().azure ? accuracy[i] : toneList[i] ? 100 : null, s.spoken, toneList[i]?.guess),
  )

  const logged: AttemptSyllable[] = syllables.map((s, i) => ({
    hanzi: s.hanzi,
    spokenTone: s.spoken,
    prevTone: i > 0 ? syllables[i - 1].spoken : null,
    predictedTone: toneList[i]?.guess.tone ?? null,
    accuracy: accuracy[i],
    status: statuses[i],
  }))
  const chars = syllables.map((s, i) => ({ hanzi: s.hanzi, accuracy: accuracy[i] ?? (toneList[i] ? 100 : null), errorType: 'None', offset: null, duration: null }))
  await saveAttempt({ id: newId(), type: 'dojo', refText: item.word, scores: totals(chars, fluency), syllables: logged, createdAt: Date.now() }, wav)
  return { statuses, tones: toneList, accuracy }
}
