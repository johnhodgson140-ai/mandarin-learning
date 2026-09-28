import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Tone } from '../src/chinese/tones.ts'
import { buildDojo } from '../src/grading/dojo.ts'
import { pairStats } from '../src/grading/toneStats.ts'

let seed = 1
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

test('dojo: 12 two-syllable words with varied tone pairs when there is no history', () => {
  const items = buildDojo(new Map(), new Map(), 12, random)
  assert.equal(items.length, 12)
  assert.ok(items.every((i) => i.token.syllables.length === 2))
  assert.equal(new Set(items.map((i) => i.word)).size, 12)
  assert.ok(new Set(items.map((i) => i.pair.join('-'))).size >= 10, 'mostly different tone pairs')
})

test('dojo: leads with my weakest pairs, using spoken tones (你好 counts as 2-3)', () => {
  const s = (prevTone: Tone, spokenTone: Tone, status: 'ok' | 'wrong') => ({ prevTone, spokenTone, status })
  const stats = pairStats([
    s(2, 3, 'wrong'), s(2, 3, 'wrong'), s(2, 3, 'wrong'),
    s(4, 4, 'wrong'), s(4, 4, 'wrong'), s(4, 4, 'ok'),
    s(1, 1, 'ok'), s(1, 1, 'ok'), s(1, 1, 'ok'),
  ])
  const items = buildDojo(new Map(), stats, 12, random)
  const pairs = items.map((i) => i.pair.join('-'))
  assert.equal(pairs[0], '2-3')
  assert.equal(pairs[1], '4-4')
  assert.ok(pairs.filter((p) => p === '2-3').length >= 3)
  const nihao = buildDojo(new Map(), new Map(), 60, random).find((i) => i.word === '你好')
  assert.deepEqual(nihao?.pair, [2, 3])
})

test('dojo: uses my Anki words (not new ones)', () => {
  const lexicon = new Map([
    ['球衣', { pinyin: 'qiúyī', english: 'football shirt', mastery: 'young' as const }],
    ['卖家', { pinyin: 'màijiā', english: 'seller', mastery: 'new' as const }],
  ])
  const words = buildDojo(lexicon, new Map(), 60, random).map((i) => i.word)
  assert.ok(words.includes('球衣'))
  assert.ok(!words.includes('卖家'))
})
