// Read-aloud: grade one paragraph of a story and log the attempt.

import type { Recording } from '../audio/recorder.ts'
import type { Token } from '../chinese/tokens.ts'
import { scoreSpeech } from '../scoring/speechScore.ts'
import { getKeys } from '../services/keys.ts'
import { assess } from '../services/azure.ts'
import { newId, saveAttempt, type AttemptSyllable } from '../services/attempts.ts'
import { syllableTones } from '../services/tone.ts'
import { alignToReference, statusFor, totals, type Scores, type Status } from './grade.ts'

/** `fluency` is null without Azure (the free scorer can't judge it). */
export type ParagraphResult = { attemptId: string; statuses: Status[]; scores: Omit<Scores, 'fluency'> & { fluency: number | null }; wav: Blob }

export async function gradeParagraph(tokens: Token[], rec: Recording, storyId: string, paragraph: number): Promise<ParagraphResult> {
  if (!getKeys().azure) return gradeLocally(tokens, rec, storyId, paragraph)
  const wav = rec.wav
  const refText = tokens.map((t) => t.text).join('')
  const { words, fluency } = await assess(wav, refText)
  const chars = alignToReference(refText, words)
  const syllables = tokens.flatMap((t) => t.syllables)

  const tones = await syllableTones(wav, chars) // null until I've calibrated my voice
  const statuses = chars.map((c, i) => statusFor(c.accuracy, syllables[i]?.spoken, tones?.[i]?.guess))
  const scores = totals(chars, fluency)
  const logged: AttemptSyllable[] = chars.map((c, i) => ({
    hanzi: c.hanzi,
    spokenTone: syllables[i]?.spoken ?? 5,
    prevTone: i > 0 ? (syllables[i - 1]?.spoken ?? null) : null,
    predictedTone: tones?.[i]?.guess.tone ?? null,
    accuracy: c.accuracy,
    status: statuses[i],
  }))

  const attemptId = newId()
  // Saving is for history and stats only: if on-device storage fails, still show the grade.
  await saveAttempt({ id: attemptId, type: 'read', refText, storyId, paragraph, scores, syllables: logged, seconds: rec.seconds, createdAt: Date.now() }, wav).catch(() => {})
  return { attemptId, statuses, scores, wav }
}

/** No Azure key: tones found on the device; sounds checked by the browser recogniser when it's available. */
async function gradeLocally(tokens: Token[], rec: Recording, storyId: string, paragraph: number): Promise<ParagraphResult> {
  const refText = tokens.map((t) => t.text).join('')
  const syllables = tokens.flatMap((t) => t.syllables)
  const result = await scoreSpeech(syllables, rec)
  const statuses = result.syllables.map((s) => s.status)
  const heard = result.syllables.filter((s) => s.sound === null || s.sound > 0).length
  const scores = { accuracy: result.overall, fluency: null, completeness: Math.round((heard / Math.max(1, syllables.length)) * 100) }
  const logged: AttemptSyllable[] = syllables.map((s, i) => ({
    hanzi: s.hanzi,
    spokenTone: s.spoken,
    prevTone: i > 0 ? syllables[i - 1].spoken : null,
    predictedTone: result.syllables[i].heardTone,
    accuracy: result.syllables[i].checked ? result.syllables[i].score : null,
    status: statuses[i],
  }))
  const attemptId = newId()
  // Saving is for history and stats only: if on-device storage fails, still show the grade.
  await saveAttempt({ id: attemptId, type: 'read', refText, storyId, paragraph, scores: { ...scores, fluency: 0 }, syllables: logged, seconds: rec.seconds, createdAt: Date.now() }, rec.wav).catch(() => {})
  return { attemptId, statuses, scores, wav: rec.wav }
}
