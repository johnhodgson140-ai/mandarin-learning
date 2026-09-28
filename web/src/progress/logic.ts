// Levels, XP and streaks (docs/SPEC.md §8–10). XP only for real work; nothing for opening the app or tapping.

export type Activity = {
  /** Graded attempts: when, how many syllables were ok, seconds of speaking. */
  attempts: { createdAt: number; okSyllables: number; seconds: number }[]
  /** Stories I finished. */
  storiesFinished: { readAt: number }[]
  /** Missions / free talks with a report. */
  missionsDone: { createdAt: number }[]
}

export const XP = { okSyllable: 1, minuteSpoken: 5, storyFinished: 20, missionDone: 30 }

export function totalXp(a: Activity): number {
  const ok = a.attempts.reduce((sum, t) => sum + t.okSyllables, 0)
  const minutes = a.attempts.reduce((sum, t) => sum + t.seconds, 0) / 60
  return Math.round(ok * XP.okSyllable + minutes * XP.minuteSpoken + a.storiesFinished.length * XP.storyFinished + a.missionsDone.length * XP.missionDone)
}

/** Local calendar day, e.g. "2026-09-28". */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function activeDays(a: Activity): Set<string> {
  return new Set([
    ...a.attempts.map((t) => dayKey(t.createdAt)),
    ...a.storiesFinished.map((s) => dayKey(s.readAt)),
    ...a.missionsDone.map((m) => dayKey(m.createdAt)),
  ])
}

const DAY = 24 * 60 * 60 * 1000
export const FREEZES_PER_MONTH = 2

/**
 * Days in a row with real work, counting back from today (today not done yet doesn't break it).
 * Up to 2 missed days per calendar month are covered by freezes.
 */
export function streak(days: Set<string>, now = Date.now()): { days: number; freezesLeft: number } {
  const used = new Map<string, number>() // month → freezes used
  let count = 0
  let t = days.has(dayKey(now)) ? now : now - DAY
  for (let guard = 0; guard < 3650; guard++, t -= DAY) {
    const key = dayKey(t)
    if (days.has(key)) {
      count++
      continue
    }
    const month = key.slice(0, 7)
    const u = used.get(month) ?? 0
    // A freeze only bridges a gap between active days, never the start of the streak.
    if (count > 0 && u < FREEZES_PER_MONTH && [...days].some((d) => d < key)) {
      used.set(month, u + 1)
      continue
    }
    break
  }
  const thisMonth = dayKey(now).slice(0, 7)
  return { days: count, freezesLeft: FREEZES_PER_MONTH - (used.get(thisMonth) ?? 0) }
}

/** Rough HSK level from how many words I know (HSK 3.0-style cumulative word counts, rounded). */
export function estimateHsk(knownWords: number): number {
  const thresholds = [150, 300, 600, 1200, 2500, 5000]
  let level = 0
  for (const t of thresholds) if (knownWords >= t) level++
  return level
}

export function minutesThisWeek(a: Activity, now = Date.now()): number {
  const since = now - 7 * DAY
  return Math.round(a.attempts.filter((t) => t.createdAt >= since).reduce((sum, t) => sum + t.seconds, 0) / 60)
}

/** Level-up ("boss") rule: a mission at the next level with its goal achieved and pronunciation ≥ 75. */
export const passesBoss = (missionLevel: number, myLevel: number, goalAchieved: boolean, pronunciation: number | null) =>
  missionLevel === myLevel + 1 && goalAchieved && (pronunciation ?? 0) >= 75
