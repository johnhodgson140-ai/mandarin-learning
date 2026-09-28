import assert from 'node:assert/strict'
import { test } from 'node:test'
import { earItems, patternOf, pickItem, recordAnswer, weakest, type EarStats } from '../src/ears/logic.ts'
import type { Syllable } from '../src/chinese/tokens.ts'
import type { Tone } from '../src/chinese/tones.ts'

const syl = (hanzi: string, written: Tone, spoken: Tone = written): Syllable => ({ hanzi, pinyin: '', written, spoken })

test('earItems keeps fair questions only', () => {
  const words = [
    { text: '妈', syllables: [syl('妈', 1)] },
    { text: '学生', syllables: [syl('学', 2), syl('生', 1)] },
    { text: '你好', syllables: [syl('你', 3, 2), syl('好', 3)] }, // sandhi: ambiguous
    { text: '桌子', syllables: [syl('桌', 1), syl('子', 5)] }, // neutral tone
    { text: 'ok', syllables: [] },
  ]
  assert.deepEqual(earItems(words, 1).map((i) => i.text), ['妈'])
  assert.deepEqual(earItems(words, 2).map((i) => i.text), ['学生'])
  assert.equal(patternOf(earItems(words, 2)[0].tones), '2-1')
})

test('pickItem favours patterns I get wrong and never repeats the last word', () => {
  const items = [
    { text: '妈', syllables: [], tones: [1] as Tone[] },
    { text: '马', syllables: [], tones: [3] as Tone[] },
  ]
  let stats: EarStats = {}
  for (let i = 0; i < 10; i++) stats = recordAnswer(stats, '1', true)
  for (let i = 0; i < 10; i++) stats = recordAnswer(stats, '3', i < 3)
  let seed = 42
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const counts: Record<string, number> = { 妈: 0, 马: 0 }
  for (let i = 0; i < 400; i++) counts[pickItem(items, stats, null, rand)!.text]++
  assert.ok(counts['马'] > counts['妈'] * 2, `weak tone 3 comes up more (${counts['马']} vs ${counts['妈']})`)
  assert.equal(pickItem(items, stats, '马', rand)!.text, '妈')
  assert.deepEqual(weakest(stats), [{ pattern: '3', accuracy: 0.3 }])
})
