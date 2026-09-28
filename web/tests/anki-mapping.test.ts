import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cardsToWords,
  colourPinyin,
  countMastery,
  masteryFor,
  stripHtml,
  toneOf,
  type AnkiCard,
} from '../src/services/anki-mapping.ts'

const fields = (hanzi: string, pinyin: string, english: string): AnkiCard['fields'] => ({
  Hanzi: { value: hanzi, order: 0 },
  Pinyin: { value: pinyin, order: 1 },
  English: { value: english, order: 2 },
})

test('stripHtml removes tags, decodes entities and tidies whitespace', () => {
  assert.equal(stripHtml('<span class="t3">nǐ</span><span class="t3">hǎo</span>'), 'nǐhǎo')
  assert.equal(stripHtml('<b>hello</b>&nbsp;&amp;<br>goodbye'), 'hello & goodbye')
  assert.equal(stripHtml('&#20320;&#x597D;'), '你好')
  assert.equal(stripHtml('  a \n  b  '), 'a b')
  assert.equal(stripHtml('&unknown;'), '&unknown;')
})

test('masteryFor follows the SPEC thresholds', () => {
  assert.equal(masteryFor(false, 0), 'new')
  assert.equal(masteryFor(true, -600), 'learning') // learning cards report negative seconds
  assert.equal(masteryFor(true, 0), 'learning')
  assert.equal(masteryFor(true, 1), 'young')
  assert.equal(masteryFor(true, 20), 'young')
  assert.equal(masteryFor(true, 21), 'mature')
})

test('cardsToWords groups a note\'s cards and uses the largest interval', () => {
  const cards: AnkiCard[] = [
    { cardId: 1, note: 10, interval: 3, type: 2, fields: fields('你好', '<span class="t3">nǐ</span><span class="t3">hǎo</span>', 'hello') },
    { cardId: 2, note: 10, interval: 30, type: 2, fields: fields('你好', 'nǐhǎo', 'hello') },
    { cardId: 3, note: 11, interval: 0, type: 0, fields: fields('谢谢', 'xièxie', 'thanks') },
    { cardId: 4, note: 12, interval: -600, type: 1, fields: fields('<b>再见</b>', 'zàijiàn', 'bye') },
    { cardId: 5, note: 12, interval: 0, type: 0, fields: fields('再见', 'zàijiàn', 'bye') },
    { cardId: 6, note: 13, interval: 5, type: 2, fields: fields('', 'x', 'empty hanzi is skipped') },
  ]
  const words = cardsToWords(cards)
  assert.deepEqual(
    words.map((w) => [w.noteId, w.hanzi, w.pinyin, w.interval, w.mastery]),
    [
      [10, '你好', 'nǐhǎo', 30, 'mature'],
      [11, '谢谢', 'xièxie', 0, 'new'],
      [12, '再见', 'zàijiàn', 0, 'learning'],
    ],
  )
  assert.deepEqual(countMastery(words), { new: 1, learning: 1, young: 0, mature: 1 })
})

test('toneOf reads tone marks, including ü and capitals', () => {
  assert.deepEqual(['mā', 'má', 'mǎ', 'mà', 'ma', 'lǜ', 'Ǎ'].map(toneOf), [1, 2, 3, 4, 5, 4, 3])
  assert.equal(toneOf('má'), 2) // decomposed accent
})

test('colourPinyin wraps each syllable in the deck\'s tone class', () => {
  assert.equal(colourPinyin(['cè', 'shì']), '<span class="t4">cè</span><span class="t4">shì</span>')
  assert.equal(colourPinyin(['xiè', 'xie']), '<span class="t4">xiè</span><span class="t5">xie</span>')
})
