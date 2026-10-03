import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { sentenceErrors, type Sentences } from '../src/chinese/sentences.ts'
import { mineSentence } from '../src/services/sentenceMining.ts'

const pub = join(import.meta.dirname, '..', 'public')
const list: [string, string, string][] = JSON.parse(readFileSync(join(pub, 'daily-words.json'), 'utf8')).words
const rank = new Map(list.map(([h], i) => [h, i]))
const sentences: Sentences = JSON.parse(readFileSync(join(pub, 'sentences.json'), 'utf8')).sentences

test('every example sentence is for a list word, contains it and uses easy words', () => {
  const problems = Object.entries(sentences).flatMap(([word, [zh, en]]) => {
    if (!rank.has(word)) return [`${word}: not in the word list`]
    return sentenceErrors(word, zh, en, rank).map((e) => `${word} ${zh}: ${e}`)
  })
  assert.deepEqual(problems, [])
})

test('the first 400 words all have a sentence', () => {
  assert.deepEqual(list.slice(0, 400).map(([h]) => h).filter((h) => !sentences[h]), [])
})

test('a sentence that uses hard words is rejected', () => {
  assert.notDeepEqual(sentenceErrors('我', '我喜欢量子物理。', 'I like quantum physics.', rank), [])
  assert.notDeepEqual(sentenceErrors('我', '你好。', 'Hello.', rank), [])
})

test('mining finds the shortest story sentence with the word as a whole word', () => {
  const paragraphs = [
    ['我', '喜欢', '喝', '茶', '，', '也', '喜欢', '喝', '咖啡', '。', '他', '喝', '茶', '。'],
    ['茶叶', '很', '贵', '。'],
  ]
  assert.equal(mineSentence('茶', [paragraphs]), '他喝茶。')
  assert.equal(mineSentence('茶叶子', [paragraphs]), null)
})
