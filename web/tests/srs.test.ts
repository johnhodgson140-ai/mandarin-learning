import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeCards, nextState, pickSession, type Card } from '../src/cards/srs.ts'

const DAY = 24 * 60 * 60 * 1000
const now = 1_000_000_000_000

test('nextState: up a box when said well, stay when close, back to 1 when poor', () => {
  const first = nextState(undefined, 90, now)
  assert.deepEqual(first, { box: 1, due: now + DAY, lastScore: 90, seen: 1 })
  const second = nextState(first, 85, now)
  assert.equal(second.box, 2)
  assert.equal(second.due, now + 2 * DAY)
  assert.equal(nextState(second, 70, now).box, 2)
  const poor = nextState(second, 40, now)
  assert.equal(poor.box, 1)
  assert.equal(poor.due, now) // straight back into the queue
  assert.equal(nextState({ box: 5, due: 0, lastScore: 90, seen: 9 }, 95, now).box, 5)
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
