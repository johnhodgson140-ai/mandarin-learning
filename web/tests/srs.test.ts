import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeCards, nextState, pickRecallSession, pickSession, rateCard, ratingFor, retrievability, RETENTION, type Card } from '../src/cards/srs.ts'

const DAY = 24 * 60 * 60 * 1000
const now = 1_000_000_000_000

test('FSRS: good answers space reviews out, again brings it back today, box states convert', () => {
  const first = nextState(undefined, 90, now) // good
  assert.equal(first.seen, 1)
  assert.ok(first.stability! > 2 && first.stability! < 4, `new card, good: stability ${first.stability}`)
  const later = first.due + DAY // reviewed a day late
  const second = nextState(first, 90, later)
  assert.ok(second.stability! > first.stability! * 2, 'stability grows after a successful review')
  assert.ok(second.due - later > (first.due - now) * 2, 'the next gap is much longer')
  const hard = nextState(first, 70, later)
  assert.ok(hard.stability! < second.stability!, 'hard grows less than good')
  const again = nextState(second, 40, second.due)
  assert.equal(again.due, second.due, 'forgotten: straight back into the queue')
  assert.ok(again.stability! < second.stability!, 'forgetting lowers stability')
  assert.ok(again.difficulty! > second.difficulty!, 'and raises difficulty')
  // An old box-system state (box 3 = 4 days) reviewed on time.
  const converted = nextState({ box: 3, due: now, lastScore: 90, seen: 3 }, 90, now)
  assert.ok(converted.stability! > 4 && converted.difficulty !== undefined)
  assert.equal(ratingFor(59), 1)
  assert.equal(ratingFor(95), 4)
  assert.ok(Math.abs(retrievability(10, 10) - RETENTION) < 0.001, 'stability = days to 90% recall')
})

test('pickSession: due cards first by box, then a few new ones, Anki words before app words', () => {
  const cards: Card[] = [
    { hanzi: '甲', english: '', source: 'app' },
    { hanzi: '乙', english: '', source: 'anki' },
    { hanzi: '丙', english: '', source: 'app' },
    { hanzi: '丁', english: '', source: 'app' },
    { hanzi: '戊', english: '', source: 'story' },
  ]
  const states = {
    丙: { box: 3, due: now - 1, lastScore: 90, seen: 3 },
    丁: { box: 1, due: now - 1, lastScore: 50, seen: 1 },
    甲: { box: 2, due: now + DAY, lastScore: 90, seen: 2 }, // not due
  }
  assert.deepEqual(pickSession(cards, states, { size: 10, newPerSession: 1, now }).map((c) => c.hanzi), ['丁', '丙', '乙'])
  assert.deepEqual(pickSession(cards, states, { size: 3, newPerSession: 2, now }).map((c) => c.hanzi), ['丁', '乙', '戊'])
})

test('mergeCards keeps the first source for duplicates', () => {
  const merged = mergeCards([{ hanzi: '你好', english: 'hi (anki)', source: 'anki' }], [{ hanzi: '你好', english: 'hello', source: 'app' }, { hanzi: '谢谢', english: 'thanks', source: 'app' }])
  assert.deepEqual(merged.map((c) => `${c.hanzi}:${c.source}`), ['你好:anki', '谢谢:app'])
})

test('Recall follows Learn: only words done in Learn, in that order, new ones after due reviews', () => {
  const card = (hanzi: string) => ({ hanzi, english: hanzi, source: 'anki' as const })
  const cards = ['飞机', '中国', '铅笔', '你好', '再见'].map(card)
  const learnOrder = ['飞机', '中国', '铅笔', '你好']
  // Nothing done in Recall yet: starts at 飞机, stops at 你好 (再见 not reached in Learn).
  assert.deepEqual(pickRecallSession(cards, {}, learnOrder, { newPerSession: 10 }).map((c) => c.hanzi), learnOrder)
  // Due Recall reviews come first; then the next new word in Learn order.
  const now = Date.UTC(2026, 8, 29)
  const recall = { 飞机: { due: now - 1, lastScore: 50, seen: 1, stability: 1, difficulty: 5, last: now - 86400000 } }
  assert.deepEqual(pickRecallSession(cards, recall, learnOrder, { newPerSession: 1, now }).map((c) => c.hanzi), ['飞机', '中国'])
})

test('Anki-style ratings: Again comes back now, Easy waits longest, and the rating is kept', () => {
  const now = Date.UTC(2026, 8, 29)
  const again = rateCard(undefined, 1, now)
  const good = rateCard(undefined, 3, now)
  const easy = rateCard(undefined, 4, now)
  assert.equal(again.due, now)
  assert.ok(good.due > now && easy.due > good.due)
  assert.equal(good.lastRating, 3)
  assert.equal(good.lastScore, null)
  assert.equal(rateCard(undefined, 2, now, 72).lastScore, 72)
})
