// Record a word or phrase, score it (free scorer, or Azure when there's a key), and log the attempt.
import type { Recording } from '../audio/recorder.ts'
import type { Syllable } from '../chinese/tokens.ts'
import { alignToReference, type AttemptSyllable } from '../grading/grade.ts'
import { newId, saveAttempt, type Attempt } from '../services/attempts.ts'
import { assess } from '../services/azure.ts'
import { getKeys } from '../services/keys.ts'
import { scoreSpeech, type SpeechScore } from './speechScore.ts'

export async function scoreAndLog(text: string, syllables: Syllable[], rec: Recording, type: Attempt['type']): Promise<SpeechScore> {
  const azure = getKeys().azure ? alignToReference(text, (await assess(rec.wav, text)).words) : null
  const result = await scoreSpeech(syllables, rec, azure)
  const logged: AttemptSyllable[] = syllables.map((s, i) => ({
    hanzi: s.hanzi,
    spokenTone: s.spoken,
    prevTone: i > 0 ? syllables[i - 1].spoken : null,
    predictedTone: result.syllables[i].heardTone,
    accuracy: result.syllables[i].score,
    status: result.syllables[i].status,
  }))
  const heardShare = result.syllables.filter((s) => s.sound === null || s.sound > 0).length / Math.max(1, syllables.length)
  await saveAttempt(
    {
      id: newId(),
      type,
      refText: text,
      scores: { accuracy: result.overall, fluency: 0, completeness: Math.round(heardShare * 100) },
      syllables: logged,
      seconds: rec.seconds,
      createdAt: Date.now(),
    },
    rec.wav,
  )
  return result
}
