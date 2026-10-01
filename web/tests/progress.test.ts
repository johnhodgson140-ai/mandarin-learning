import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeDays, dayKey, estimateHsk, minutesThisWeek, passesBoss, streak, totalXp, type Activity } from '../src/progress/logic.ts'

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 8, 28, 12).getTime() // 28 Sep 2026, noon local
const at = (daysAgo: number) => now - daysAgo * DAY

test('XP only from real work', () => {
  const a: Activity = {
    attempts: [{ createdAt: now, okSyllables: 30, seconds: 120 }, { createdAt: now, okSyllables: 5, seconds: 60 }],
    storiesFinished: [{ readAt: now }],
    missionsDone: [{ createdAt: now }, { createdAt: now }],
  }
  assert.equal(totalXp(a), 35 + 15 + 20 + 60)
  assert.equal(totalXp({ attempts: [], storiesFinished: [], missionsDone: [] }), 0)
})

test('streak counts back from today, not broken by today being undone', () => {
  const days = (...ago: number[]) => new Set(ago.map((d) => dayKey(at(d))))
  assert.equal(streak(days(0, 1, 2), now).days, 3)
  assert.equal(streak(days(1, 2), now).days, 2) // not practised yet today
  assert.equal(streak(days(), now).days, 0)
})

test('streak: two freezes a month bridge missed days', () => {
  const days = (...ago: number[]) => new Set(ago.map((d) => dayKey(at(d))))
  const s = streak(days(0, 2, 3, 5), now) // missed 1 and 4 days ago
  assert.equal(s.days, 4)
  assert.equal(s.freezesLeft, 0)
  assert.equal(streak(days(0, 2, 4, 6), now).days, 3) // third miss in September breaks it
})

test('active days, HSK estimate, minutes this week, boss rule', () => {
  const a: Activity = { attempts: [{ createdAt: at(1), okSyllables: 1, seconds: 300 }, { createdAt: at(9), okSyllables: 1, seconds: 600 }], storiesFinished: [{ readAt: at(0) }], missionsDone: [] }
  assert.equal(activeDays(a).size, 3)
  assert.equal(minutesThisWeek(a, now), 5)
  assert.deepEqual([0, 149, 150, 700, 5000].map(estimateHsk), [0, 0, 1, 3, 6])
  assert.ok(passesBoss(2, 1, true, 80))
  assert.ok(!passesBoss(2, 1, true, 70))
  assert.ok(!passesBoss(1, 1, true, 90))
})

test('days I only rated cards count as active', () => {
  const a: Activity = { attempts: [], storiesFinished: [], missionsDone: [], cardDays: ['2026-09-30'] }
  assert.equal(activeDays(a).has('2026-09-30'), true)
})
