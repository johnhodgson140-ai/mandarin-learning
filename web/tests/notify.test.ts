import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_NOTIFY, planNotifications, wordFor, type NotifySettings } from '../src/notify/plan.ts'

const words = [
  { hanzi: '外套', pinyin: 'wàitào', english: 'jacket' },
  { hanzi: '饺子', pinyin: 'jiǎozi', english: 'dumpling' },
  { hanzi: '可乐', pinyin: 'kělè', english: 'cola' },
]
const allOn: NotifySettings = {
  dailyWords: DEFAULT_NOTIFY.dailyWords,
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

test("today's words: next words of the deck in order, a new set each day, round the deck", async () => {
  const { dailyWords } = await import('../src/notify/plan.ts')
  const deck = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  assert.deepEqual(dailyWords(new Date(2026, 9, 1, 8), deck, 3), ['a', 'b', 'c'], 'starts on 1 October with the first words')
  assert.deepEqual(dailyWords(new Date(2026, 9, 1, 23), deck, 3), ['a', 'b', 'c'], 'same set all day')
  assert.deepEqual(dailyWords(new Date(2026, 9, 2, 7), deck, 3), ['d', 'e', 'f'])
  assert.deepEqual(dailyWords(new Date(2026, 9, 3, 7), deck, 3), ['g', 'a', 'b'], 'wraps round')
  assert.deepEqual(dailyWords(new Date(2026, 8, 30), deck, 3), ['e', 'f', 'g'], 'days before the start work too')
  assert.deepEqual(dailyWords(new Date(2026, 9, 1), ['x'], 5), ['x'])
})

test("today's words notifications: spread out, then a recap, three days ahead", () => {
  const now = new Date(2026, 9, 1, 12, 0)
  const settings: NotifySettings = { ...DEFAULT_NOTIFY, dailyWords: { on: true, count: 3, from: '09:00', to: '21:00' } }
  const plan = planNotifications({ now, settings, dueCount: 0, practisedToday: false, words, toneTip: null })
  const today = plan.filter((p) => p.at.getDate() === 1)
  // 9:00 has passed; 13:00 and 17:00 are still to come, then the recap at 21:00.
  assert.deepEqual(today.map((p) => `${p.at.getHours()}:${p.at.getMinutes()}`), ['13:0', '17:0', '21:0'])
  assert.ok(today.at(-1)!.body.includes('外套') && today.at(-1)!.body.includes('可乐'))
  assert.equal(plan.length, 3 + 4 + 4)
  assert.ok(plan.every((p) => p.route === '#speak/words'))
  assert.equal(new Set(plan.map((p) => p.id)).size, plan.length)
})
