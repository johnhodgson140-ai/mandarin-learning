import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chineseDate, chineseTime, number } from '../src/chinese/clock.ts'

test('numbers', () => {
  assert.deepEqual([10, 15, 20, 35, 59].map((n) => number(n).hanzi), ['十', '十五', '二十', '三十五', '五十九'])
  assert.equal(number(42).pinyin, "sìshí'èr")
})

test('the time as it is said', () => {
  assert.deepEqual(chineseTime(15, 20), { hanzi: '下午三点二十', pinyin: 'xiàwǔ sān diǎn èrshí' })
  assert.deepEqual(chineseTime(14, 0), { hanzi: '下午两点', pinyin: 'xiàwǔ liǎng diǎn' }) // 两, not 二
  assert.deepEqual(chineseTime(8, 30), { hanzi: '早上八点半', pinyin: 'zǎoshang bā diǎn bàn' })
  assert.deepEqual(chineseTime(10, 5), { hanzi: '上午十点零五分', pinyin: 'shàngwǔ shí diǎn líng wǔ fēn' })
  assert.deepEqual(chineseTime(0, 12), { hanzi: '凌晨十二点十二', pinyin: "língchén shí'èr diǎn shí'èr" })
  assert.deepEqual(chineseTime(12, 45), { hanzi: '中午十二点四十五', pinyin: "zhōngwǔ shí'èr diǎn sìshíwǔ" })
  assert.deepEqual(chineseTime(21, 1), { hanzi: '晚上九点零一分', pinyin: 'wǎnshang jiǔ diǎn líng yī fēn' })
})

test('the date as it is written and said', () => {
  assert.deepEqual(chineseDate(9, 29, 2), { date: '九月二十九日', weekday: '星期二', pinyin: 'jiǔ yuè èrshíjiǔ rì · xīngqī èr' })
  assert.deepEqual(chineseDate(12, 1, 0), { date: '十二月一日', weekday: '星期日', pinyin: "shí'èr yuè yī rì · xīngqī rì" })
  assert.equal(chineseDate(10, 10, 6).date, '十月十日')
})
