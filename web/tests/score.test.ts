import assert from 'node:assert/strict'
import { test } from 'node:test'
import { combine, scoreColour, soundScore, splitSyllable, statusOf, tips } from '../src/scoring/score.ts'

test('splitSyllable', () => {
  assert.deepEqual(splitSyllable('zhāng'), { initial: 'zh', final: 'ang' })
  assert.deepEqual(splitSyllable('ài'), { initial: '', final: 'ai' })
  assert.deepEqual(splitSyllable('lǜ'), { initial: 'l', final: 'ü' })
  assert.deepEqual(splitSyllable('xué'), { initial: 'x', final: 'ue' })
})

test('soundScore: half initial, half final', () => {
  assert.equal(soundScore('zhī', 'zhi'), 100)
  assert.equal(soundScore('zhī', 'zi'), 50)
  assert.equal(soundScore('shēng', 'shen'), 50)
  assert.equal(soundScore('mā', 'lu'), 0)
  assert.equal(soundScore('mā', null), 0)
})

test('combine: sound and tone count equally; neutral tone is sound only', () => {
  const both = combine(100, [0.05, 0.8, 0.05, 0.05, 0.05], 2)
  assert.equal(both.score, 90)
  assert.equal(both.heardTone, 2)
  assert.equal(combine(50, [0.7, 0.1, 0.1, 0.05, 0.05], 3).score, 30)
  assert.equal(combine(100, [0.9, 0.025, 0.025, 0.025, 0.025], 5).score, 100)
  assert.equal(combine(null, [0.1, 0.1, 0.65, 0.1, 0.05], 3).score, 65)
  assert.equal(combine(null, null, 1).score, 1)
})

test('status and colour scale', () => {
  assert.deepEqual([statusOf(95), statusOf(70), statusOf(30)], ['ok', 'minor', 'wrong'])
  assert.equal(scoreColour(100), 'rgb(79 127 95)')
  assert.equal(scoreColour(70), 'rgb(200 145 58)')
  assert.equal(scoreColour(10), 'rgb(181 82 63)')
})

test('tips explain sound and tone mistakes', () => {
  const zhz = combine(50, [0.9, 0.025, 0.025, 0.025, 0.025], 1, 'zi')
  assert.deepEqual(tips('zhī', 1, zhz), ['Heard "z" instead of "zh". For zh, curl the tip of your tongue back; z is flat, behind the teeth.'])
  const tone = combine(100, [0.05, 0.8, 0.1, 0.03, 0.02], 3, 'hao')
  assert.match(tips('hǎo', 3, tone)[0], /^Sounded like tone 2\. Tone 3 goes low/)
  const nasal = combine(50, null, 1, 'shen')
  assert.match(tips('shēng', 1, nasal)[0], /-ng is at the back/)
  assert.deepEqual(tips('mā', 1, combine(100, [0.9, 0.025, 0.025, 0.025, 0.025], 1, 'ma')), [])
})

import { alignSyllables, bestAlternative } from '../src/scoring/score.ts'

test('alignSyllables: matches by sound, pairs substitutions, marks missing', () => {
  assert.deepEqual(alignSyllables(['wǒ', 'xǐ', 'huan', 'zhī', 'shi'], ['wo', 'xi', 'huan', 'zi', 'shi']), ['wo', 'xi', 'huan', 'zi', 'shi'])
  assert.deepEqual(alignSyllables(['mà'], ['ma']), ['ma']) // homophone char is fine
  assert.deepEqual(alignSyllables(['wǒ', 'bù', 'qù'], ['wo', 'qu']), ['wo', null, 'qu'])
  assert.deepEqual(alignSyllables(['nǐ', 'hǎo'], ['en', 'ni', 'hao']), ['ni', 'hao']) // extra sound ignored
})

test('bestAlternative picks the closest recogniser guess', () => {
  assert.deepEqual(bestAlternative(['shēng', 'rì'], [['sheng', 'li'], ['sheng', 'ri']]), ['sheng', 'ri'])
})
