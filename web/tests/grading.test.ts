import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignToReference, statusFor, totals, type AzureWord } from '../src/grading/grade.ts'

const w = (word: string, accuracy: number, offset: number, errorType = 'None', syllables?: AzureWord['syllables']): AzureWord => ({
  word, accuracy, errorType, offset, duration: 400, syllables,
})

test('statusFor: Azure-only thresholds', () => {
  assert.equal(statusFor(95), 'ok')
  assert.equal(statusFor(80), 'ok')
  assert.equal(statusFor(79), 'minor')
  assert.equal(statusFor(60), 'minor')
  assert.equal(statusFor(59), 'wrong')
  assert.equal(statusFor(null), 'wrong')
})

test('statusFor: tone model merge', () => {
  assert.equal(statusFor(95, 3, { tone: 3, confidence: 0.9 }), 'ok')
  assert.equal(statusFor(95, 3, { tone: 2, confidence: 0.9 }), 'wrong') // confident wrong tone
  assert.equal(statusFor(95, 3, { tone: 2, confidence: 0.4 }), 'minor') // unsure wrong tone
  assert.equal(statusFor(95, 3, { tone: 3, confidence: 0.4 }), 'minor') // unsure right tone
  assert.equal(statusFor(50, 3, { tone: 3, confidence: 0.9 }), 'wrong') // accuracy still rules
})

test('alignToReference maps words to characters, per syllable when available', () => {
  const result = alignToReference('我喜欢足球。', [
    w('我', 90, 0),
    w('喜欢', 70, 500, 'Mispronunciation', [{ accuracy: 95, offset: 500, duration: 200 }, { accuracy: 45, offset: 700, duration: 200 }]),
    w('足球', 88, 1000),
  ])
  assert.deepEqual(result.map((c) => [c.hanzi, c.accuracy, c.offset]), [
    ['我', 90, 0], ['喜', 95, 500], ['欢', 45, 700], ['足', 88, 1000], ['球', 88, 1200],
  ])
})

test('alignToReference: skipped words become omissions, extra words are ignored', () => {
  const result = alignToReference('我喜欢足球', [
    w('我', 90, 0),
    w('很', 80, 300, 'Insertion'), // said an extra word
    w('喜欢', 0, 0, 'Omission'), // Azure's own omission marker
    w('足球', 85, 900),
  ])
  assert.deepEqual(result.map((c) => [c.hanzi, c.accuracy, c.errorType]), [
    ['我', 90, 'None'], ['喜', null, 'Omission'], ['欢', null, 'Omission'], ['足', 85, 'None'], ['球', 85, 'None'],
  ])
  assert.deepEqual(totals(result, 72.4), { accuracy: 87, fluency: 72, completeness: 60 })
})

test('alignToReference joins results from several utterances in order', () => {
  const result = alignToReference('你好。我是学生。', [w('你好', 90, 0), w('我', 80, 2000), w('是', 70, 2300), w('学生', 60, 2600)])
  assert.deepEqual(result.map((c) => c.accuracy), [90, 90, 80, 70, 60, 60])
  assert.deepEqual(totals([], 0), { accuracy: 0, fluency: 0, completeness: 0 })
})
