import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comparePitch, dtw, ownRange, textbookReference } from '../src/tone/compare.ts'
import { templateContour } from '../src/tone/model.ts'
import type { Tone } from '../src/chinese/tones.ts'

const shape = (tone: Tone, half: boolean) => templateContour(tone, { half })
const line = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))

test('DTW lines up the same shape said slower', () => {
  const fast = line(0, 1, 10)
  const slow = line(0, 1, 25)
  assert.ok(dtw(fast, slow).cost < 0.05)
  assert.ok(dtw(fast, line(1, 0, 25)).cost > 0.3)
})

test('own range: a deep and a high voice with the same shape match', () => {
  const deep = line(-5, 3, 20)
  const high = line(10, 18, 20)
  assert.deepEqual(ownRange(deep).map((v) => v.toFixed(2)), ownRange(high).map((v) => v.toFixed(2)))
})

test('saying tone 4 as a rise scores low and says to fall', () => {
  const syllables = [{ hanzi: '是', spoken: 4 as Tone }]
  const reference = textbookReference(syllables, shape)
  const right = comparePitch(line(20, 8, 30), reference, syllables)!
  const wrong = comparePitch(line(8, 20, 30), reference, syllables)!
  assert.ok(right.similarity > 70, `right ${right.similarity}`)
  assert.ok(wrong.similarity < 40, `wrong ${wrong.similarity}`)
  assert.deepEqual(right.tips, [])
  assert.match(wrong.tips[0], /是.*fall/)
  assert.equal(wrong.mine.length, reference.length)
})

test('too little voice to compare gives null', () => {
  assert.equal(comparePitch([1, 2, 3], [0, 1], [{ hanzi: '好', spoken: 3 }]), null)
})
