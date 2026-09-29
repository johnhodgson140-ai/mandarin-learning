// Builds src/chinese/pinyin-fixes.json: the dictionary pinyin (CC-CEDICT, via the complete HSK vocabulary) for every
// HSK word where pinyin-pro disagrees, mostly missing neutral tones (朋友 péng you, 谢谢 xiè xie, 裤子 kù zi) and a few
// wrong readings (只不过 zhǐ, 局长 zhǎng, 心脏 zàng). Words with more than one dictionary reading use the everyday one
// chosen in EVERYDAY below; if pinyin-pro already gives one of the readings and it isn't listed, it's left alone.
// Run: node scripts/build-pinyin-fixes.ts path/to/complete.json   (github.com/drkameleon/complete-hsk-vocabulary)

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pinyin } from 'pinyin-pro'
import { markTone, type Tone } from '../src/chinese/tones.ts'

type Entry = { simplified: string; forms: { transcriptions: { numeric: string } }[] }

/** Everyday reading for words the dictionary lists more than once. */
const EVERYDAY: Record<string, string> = {
  把手: 'bǎ shou', 本事: 'běn shi', 出息: 'chū xi', 大方: 'dà fang', 大爷: 'dà ye', 地道: 'dì dao', 地方: 'dì fang',
  东西: 'dōng xi', 多少: 'duō shao', 恶心: 'ě xin', 分量: 'fèn liang', 告诉: 'gào su', 工夫: 'gōng fu', 故事: 'gù shi',
  管子: 'guǎn zi', 好处: 'hǎo chu', 金子: 'jīn zi', 妻子: 'qī zi', 起来: 'qǐ lai', 人家: 'rén jia', 上头: 'shàng tou',
  生意: 'shēng yi', 说法: 'shuō fa', 琢磨: 'zuó mo', 便宜: 'pián yi', 裁缝: 'cái feng', 大夫: 'dài fu', 狮子: 'shī zi',
  孙子: 'sūn zi', 结实: 'jiē shi', 片子: 'piān zi', 重点: 'zhòng diǎn', 好吃: 'hǎo chī', 结果: 'jié guǒ',
}

const HAN = /^\p{Script=Han}+$/u
const words = (p: string) => p.normalize('NFC').toLowerCase().split(/\s+/).filter(Boolean)

/** "lu:e4" → "lüè", "fang5" → "fang", "r5" → "r". */
function fromNumeric(numeric: string): string {
  return numeric
    .toLowerCase()
    .replace(/u:/g, 'ü')
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => {
      const m = /^([a-zü]+)([1-5])?$/.exec(s)
      return m ? markTone(m[1], Number(m[2] ?? 5) as Tone) : s
    })
    .join(' ')
}

const src = process.argv[2]
if (!src) throw new Error('Usage: node scripts/build-pinyin-fixes.ts path/to/complete.json')
const entries: Entry[] = JSON.parse(readFileSync(src, 'utf8'))
const fixes: Record<string, string> = {}
for (const e of entries) {
  const w = e.simplified
  const n = [...w].length
  if (n < 2 || !HAN.test(w)) continue
  const readings = [...new Set(e.forms.map((f) => fromNumeric(f.transcriptions.numeric)))].filter((r) => words(r).length === n)
  const ours = words(pinyin(w, { toneSandhi: false })).join(' ')
  const want = EVERYDAY[w] ?? (readings.length === 1 ? readings[0] : undefined)
  if (want && want !== ours) fixes[w] = want
}
const out = join(import.meta.dirname, '..', 'src', 'chinese', 'pinyin-fixes.json')
writeFileSync(out, JSON.stringify(fixes, Object.keys(fixes).sort(), 0))
console.log(`${Object.keys(fixes).length} corrections → ${out}`)
