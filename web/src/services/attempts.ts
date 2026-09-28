// Every graded attempt, syllable by syllable (feeds the tone-pair heatmap and weak-spot drills later).
// Stored on the device (IndexedDB) and in Firebase when signed in; recordings stay on the device for 30 days.

import type { AttemptSyllable, Scores } from '../grading/grade.ts'
import { currentUser, dbPut, isConfigured } from './firebase.ts'
import { idbAll, idbDelete, idbGet, idbPut } from './idb.ts'

export type { AttemptSyllable }


export type Attempt = {
  id: string
  type: 'read' | 'shadow' | 'dojo' | 'card' | 'mission'
  refText: string
  storyId?: string
  paragraph?: number
  scores: Scores
  syllables: AttemptSyllable[]
  /** Seconds I spoke (for minutes spoken and XP). */
  seconds?: number
  createdAt: number
}

type Recording = { id: string; wav: Blob; createdAt: number }

const KEEP_RECORDINGS_MS = 30 * 24 * 60 * 60 * 1000

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export async function saveAttempt(attempt: Attempt, wav: Blob): Promise<void> {
  await idbPut('attempts', attempt)
  await idbPut('recordings', { id: attempt.id, wav, createdAt: attempt.createdAt } satisfies Recording).catch(() => {})
  if (isConfigured && currentUser()) await dbPut(`attempts/${attempt.id}`, attempt).catch(() => {})
}

export const allAttempts = () => idbAll<Attempt>('attempts')

export async function recordingFor(id: string): Promise<Blob | null> {
  return (await idbGet<Recording>('recordings', id))?.wav ?? null
}

/** Delete recordings older than 30 days (docs: recordings are kept for 30 days). */
export async function pruneRecordings(): Promise<void> {
  const cutoff = Date.now() - KEEP_RECORDINGS_MS
  // Monthly benchmark recordings are kept for good (they're compared side by side).
  for (const r of await idbAll<Recording>('recordings')) if (r.createdAt < cutoff && !r.id.startsWith('bench-')) await idbDelete('recordings', r.id)
}
