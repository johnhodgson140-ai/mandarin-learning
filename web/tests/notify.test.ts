import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_NOTIFY, planNotifications, wordFor, type NotifySettings } from '../src/notify/plan.ts'

const words = [
  { hanzi: '外套', pinyin: 'wàitào', english: 'jacket' },
  { hanzi: '饺子', pinyin: 'jiǎozi', english: 'dumpling' },
  { hanzi: '可乐', pinyin: 'kělè', english: 'cola' },
]
const allOn: NotifySettings = {
  wordOfDay: { on: true, time: '09:00' },
  practice: { on: true, time: '19:00' },
  streak: { on: true, time: '20:30' },
}

test('nothing is scheduled while all are off', () => {
  assert.deepEqual(planNotifications({ now: new Date(2026, 8, 29, 8), settings: DEFAULT_NOTIFY, dueCount: 3, practisedToday: false, words, toneTip: null }), [])
})

test('a week of word-of-the-day and practice reminders, only in the future', () => {
  const now = new Date(2026, 8, 29, 12, 0) // after 9:00, before 19:00
  const plan = planNotifications({ now, settings: allOn, dueCount: 12, practisedToday: false, words, toneTip: 'Hardest pair: 3 + 2' })
  const words_ = plan.filter((p) => p.title.startsWith('今天的词'))
  assert.equal(words_.length, 6, 'today 9:00 has passed')
  assert.ok(words_[0].body.includes('Hardest pair'))
  const practice = plan.filter((p) => p.title === 'Shuō 说')
  assert.equal(practice.length, 7)
  assert.equal(practice[0].body, '12 cards are ready to say out loud.')
  assert.equal(practice[1].body, 'A few minutes of speaking today?')
  assert.ok(plan.every((p) => p.at > now))
  assert.equal(new Set(plan.map((p) => p.id)).size, plan.length, 'ids are unique')
})

test("streak saver: tonight if I haven't practised, tomorrow if I have", () => {
  const now = new Date(2026, 8, 29, 12)
  const streak = (practisedToday: boolean) =>
    planNotifications({ now, settings: { ...DEFAULT_NOTIFY, streak: allOn.streak }, dueCount: 0, practisedToday, words, toneTip: null })[0].at
  assert.equal(streak(false).getDate(), 29)
  assert.equal(streak(true).getDate(), 30)
})

test('word of the day is stable within a day and changes between days', () => {
  assert.equal(wordFor(new Date(2026, 8, 29, 9), words), wordFor(new Date(2026, 8, 29, 22), words))
  const week = Array.from({ length: 6 }, (_, i) => wordFor(new Date(2026, 8, 29 + i, 9), words)!.hanzi)
  assert.ok(new Set(week).size > 1)
  assert.equal(wordFor(new Date(), []), null)
})
