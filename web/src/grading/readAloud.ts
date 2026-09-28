// Read-aloud: grade one paragraph of a story and log the attempt.

import type { Token } from '../chinese/tokens.ts'
import { assess } from '../services/azure.ts'
import { newId, saveAttempt, type AttemptSyllable } from '../services/attempts.ts'
import { alignToReference, statusFor, totals, type Scores, type Status } from './grade.ts'

export type ParagraphResult = { attemptId: string; statuses: Status[]; scores: Scores; wav: Blob }

export async function gradeParagraph(tokens: Token[], wav: Blob, storyId: string, paragraph: number): Promise<ParagraphResult> {
  const refText = tokens.map((t) => t.text).join('')
  const { words, fluency } = await assess(wav, refText)
  const chars = alignToReference(refText, words)
  const syllables = tokens.flatMap((t) => t.syllables)

  const statuses = chars.map((c, i) => statusFor(c.accuracy, syllables[i]?.spoken))
  const scores = totals(chars, fluency)
  const logged: AttemptSyllable[] = chars.map((c, i) => ({
    hanzi: c.hanzi,
    spokenTone: syllables[i]?.spoken ?? 5,
    prevTone: i > 0 ? (syllables[i - 1]?.spoken ?? null) : null,
    predictedTone: null, // tone model arrives in M4
    accuracy: c.accuracy,
    status: statuses[i],
  }))

  const attemptId = newId()
  await saveAttempt({ id: attemptId, type: 'read', refText, storyId, paragraph, scores, syllables: logged, createdAt: Date.now() }, wav)
  return { attemptId, statuses, scores, wav }
}
