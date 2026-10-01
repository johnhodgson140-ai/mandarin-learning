import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildParagraph, pinyinLine } from '../src/chinese/tokens.ts'

const { words } = JSON.parse(readFileSync(new URL('../public/daily-words.json', import.meta.url), 'utf8')) as { words: [string, string, string][] }

// The built-in Today's words list (npm run daily-list): the app, notifications and widget all read it.
test('daily-words.json: thousands of words, each once, with pinyin and a short meaning', () => {
  assert.ok(words.length > 5000)
  assert.equal(new Set(words.map(([h]) => h)).size, words.length)
  for (const [hanzi, pinyin, english] of words) {
    assert.match(hanzi, /^\p{Script=Han}{1,4}$/u)
    assert.ok(pinyin && english && english.length <= 60, hanzi)
    assert.ok(!/abbr\.|variant of|Taiwan pr/i.test(english), `${hanzi}: ${english}`)
  }
})

test('daily-words.json pinyin is the app’s own reading (rebuild with npm run daily-list after pinyin changes)', () => {
  for (const [hanzi, pinyin] of words.slice(0, 600)) assert.equal(pinyinLine(buildParagraph([hanzi], new Map())), pinyin, hanzi)
})

test('the most common words come first, with learner-friendly meanings', () => {
  assert.deepEqual(words.slice(0, 3).map(([h]) => h), ['的', '了', '我'])
  const meaning = Object.fromEntries(words.map(([h, , e]) => [h, e]))
  assert.equal(meaning['要'], 'to want; will; need to')
  assert.equal(meaning['比'], 'than; to compare')
})
