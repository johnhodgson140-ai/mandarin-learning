import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spokenTones, type SandhiSyllable } from '../src/chinese/sandhi.ts'
import { alignPinyin, buildParagraph, knownRatio, masteryOf, mergeWithLexicon, type Lexicon } from '../src/chinese/tokens.ts'
import { toneless } from '../src/chinese/tones.ts'

/** Spoken tones for a sentence split into words, via the real pipeline. */
function spoken(words: string[], lexicon: Lexicon = new Map()): string {
  return buildParagraph(words, lexicon)
    .flatMap((t) => t.syllables.map((s) => `${s.hanzi}${s.spoken}`))
    .join(' ')
}

test('3+3 → 2+3, including runs', () => {
  assert.equal(spoken(['你好']), '你2 好3')
  assert.equal(spoken(['我', '很', '好']), '我2 很2 好3')
  assert.equal(spoken(['你好', '，', '我']), '你2 好3 我3') // punctuation breaks the run
})

test('不 becomes bú only before a 4th tone', () => {
  assert.equal(spoken(['不', '是']), '不2 是4')
  assert.equal(spoken(['不', '好']), '不4 好3')
  assert.equal(spoken(['我', '不', '去']), '我3 不2 去4')
})

test('一: yí before 4th, yì before 1st–3rd, yī when counting or word-final', () => {
  assert.equal(spoken(['一个']), '一2 个4')
  assert.equal(spoken(['一', '天']), '一4 天1')
  assert.equal(spoken(['一起']), '一4 起3')
  assert.equal(spoken(['第一']), '第4 一1')
  assert.equal(spoken(['十一']), '十2 一1')
  assert.equal(spoken(['星期一', '我', '去']), '星1 期1 一1 我3 去4')
  assert.equal(spoken(['一百']), '一4 百3')
})

test('spokenTones leaves neutral tones alone', () => {
  const phrase: SandhiSyllable[] = [
    { hanzi: '对', written: 4, wordFinal: false },
    { hanzi: '不', written: 5, wordFinal: false },
    { hanzi: '起', written: 3, wordFinal: true },
  ]
  assert.deepEqual(spokenTones(phrase), [4, 5, 3])
})

const lexicon: Lexicon = new Map([
  ['谢谢', { pinyin: 'xièxie', english: 'thank you', mastery: 'mature' }],
  ['卖家', { pinyin: 'màijiā', english: 'seller', mastery: 'young' }],
  ['很', { pinyin: 'hěn', english: 'very', mastery: 'mature' }],
  ['好', { pinyin: 'hǎo', english: 'good', mastery: 'learning' }],
  ['我', { pinyin: 'wǒ', english: 'I', mastery: 'mature' }],
])

test('Anki pinyin overrides pinyin-pro when the letters match', () => {
  assert.deepEqual(alignPinyin('xièxie', ['xiè', 'xiè']), ['xiè', 'xie'])
  assert.deepEqual(alignPinyin("Xī'ān", ['xī', 'ān']), ['Xī', 'ān'])
  assert.equal(alignPinyin('hángyè', ['xíng', 'yè']), null) // different reading: keep pinyin-pro
  const [token] = buildParagraph(['谢谢'], lexicon)
  assert.deepEqual(token.syllables.map((s) => s.pinyin), ['xiè', 'xie'])
  assert.equal(token.gloss, 'thank you')
})

test('Claude splits are merged into Anki words', () => {
  assert.deepEqual(mergeWithLexicon(['他', '是', '卖', '家', '。'], lexicon), ['他', '是', '卖家', '。'])
})

test('mastery: exact, composed of Anki words (weakest part), or unknown', () => {
  assert.equal(masteryOf('卖家', lexicon), 'young')
  assert.equal(masteryOf('很好', lexicon), 'learning')
  assert.equal(masteryOf('我很', lexicon), 'mature')
  assert.equal(masteryOf('足球', lexicon), 'unknown')
})

test('known ratio skips punctuation, numbers and names', () => {
  const tokens = buildParagraph(['我', '很', '喜欢', '曼联', '，', '2026', '年', '谢谢', '。'], lexicon, new Set(['曼联']))
  assert.deepEqual(
    tokens.map((t) => `${t.text}:${t.kind}`),
    ['我:word', '很:word', '喜欢:word', '曼联:name', '，:other', '2026:number', '年:word', '谢谢:word', '。:other'],
  )
  assert.deepEqual(knownRatio(tokens), { known: 3, total: 5, ratio: 0.6 })
  assert.deepEqual(knownRatio([]), { known: 0, total: 0, ratio: 1 })
})

test('toneless strips tone marks and separators', () => {
  assert.equal(toneless("Xī'ān lǜ"), 'xianlü')
})
