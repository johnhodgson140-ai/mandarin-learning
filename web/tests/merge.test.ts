import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeMet, mergeOrder, mergeStates } from '../src/progress/merge.ts'

test('card states: the most recent review of each word wins, nothing is dropped', () => {
  const phone = { 你: { last: 200, seen: 3 }, 好: { last: 100, seen: 1 } }
  const mac = { 你: { last: 150, seen: 5 }, 好: { last: 300, seen: 2 }, 我: { last: 50, seen: 1 } }
  assert.deepEqual(mergeStates(phone, mac), { 你: { last: 200, seen: 3 }, 好: { last: 300, seen: 2 }, 我: { last: 50, seen: 1 } })
})

test('words met: all of them, with the earlier day; learn order keeps mine then adds theirs', () => {
  assert.deepEqual(mergeMet({ 的: { day: 5 } }, { 的: { day: 3 }, 了: { day: 4 } }), { 的: { day: 3 }, 了: { day: 4 } })
  assert.deepEqual(mergeOrder(['的', '了'], ['了', '我']), ['的', '了', '我'])
})
