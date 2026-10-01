// Gather what I've done (attempts, finished stories, missions) for XP, streak and the Progress screen.
import { activeDays, streak, totalXp, type Activity } from '../progress/logic.ts'
import type { Session } from '../missions/logic.ts'
import { allAttempts, type Attempt } from './attempts.ts'
import { listStories } from './library.ts'
import { cardDays } from './cards.ts'
import { load } from './storage.ts'

export async function gatherActivity(): Promise<{ activity: Activity; attempts: Attempt[] }> {
  const attempts = await allAttempts().catch(() => [] as Attempt[])
  const activity: Activity = {
    attempts: attempts.map((a) => ({ createdAt: a.createdAt, okSyllables: a.syllables.filter((s) => s.status === 'ok').length, seconds: a.seconds ?? 0 })),
    storiesFinished: listStories().flatMap((s) => (s.readAt ? [{ readAt: s.readAt }] : [])),
    missionsDone: load<Session[]>('sessions', []).flatMap((s) => (s.report ? [{ createdAt: s.createdAt }] : [])),
    cardDays: cardDays(),
  }
  return { activity, attempts }
}

export async function summary(): Promise<{ level: number; xp: number; streak: number; freezesLeft: number }> {
  const { activity } = await gatherActivity()
  const s = streak(activeDays(activity))
  return { level: load('level', 1), xp: totalXp(activity), streak: s.days, freezesLeft: s.freezesLeft }
}
