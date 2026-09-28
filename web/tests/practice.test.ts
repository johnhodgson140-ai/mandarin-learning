import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildParagraph } from '../src/chinese/tokens.ts'
import { coverage, keyWords, paceRatio, sentences, shadowable } from '../src/practice/logic.ts'

test('sentences keeps end punctuation and drops non-Chinese bits', () => {
  assert.deepEqual(sentences('我很好。你呢？OK! 我们走吧！'), ['我很好。', '你呢？', '我们走吧！'])
})

test('shadowable: 4–25 Chinese characters, no duplicates', () => {
  assert.deepEqual(shadowable(['你好。', '我今天很高兴。', '我今天很高兴。', '周末我和朋友去看足球比赛。']), ['我今天很高兴。', '周末我和朋友去看足球比赛。'])
})

test('paceRatio compares my time with the native time', () => {
  assert.equal(paceRatio(9, 2, 2), 1)
  assert.equal(paceRatio(9, 4, 2), 0.5)
  assert.equal(paceRatio(9, 2, null), 1) // 9 syllables at 4.5/s = 2 s
  assert.equal(paceRatio(9, 2.5, null, 0.8), 1)
  assert.equal(paceRatio(9, 0, 2), 0)
})

test('keyWords: content words and names, no filler or single characters', () => {
  const tokens = buildParagraph(['周末', '我们', '去', '看', '足球', '比赛', '。', '曼联', '进', '了', '两', '个', '球', '，', '足球', '很', '好看', '。'], new Map(), new Set(['曼联']))
  assert.deepEqual(keyWords(tokens), ['周末', '足球', '比赛', '曼联', '好看'])
})

test('coverage compares by sound, so homophones count', () => {
  const keys = [
    { word: '周末', pinyin: ['zhōu', 'mò'] },
    { word: '足球', pinyin: ['zú', 'qiú'] },
    { word: '比赛', pinyin: ['bǐ', 'sài'] },
  ]
  const said = ['zhou', 'mo', 'wo', 'kan', 'zu', 'qiu'] // recogniser may write 周末/足球 with other characters
  assert.deepEqual(coverage(keys, said), { covered: ['周末', '足球'], missed: ['比赛'], share: 2 / 3 })
  assert.equal(coverage([], said).share, 0)
})
