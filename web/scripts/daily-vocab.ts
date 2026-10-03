// What today's daily content should be written with (run by the daily session: docs/DAILY.md).
// The learner works through web/public/daily-words.json (HSK 1 → 6, most common first) a few words a day. Their phone
// knows exactly how far they've got; this repo doesn't, so it estimates: the first `basics` words, plus `per_day` a
// day since `start` (content/config.json → curriculum). Prints JSON: the estimated position, the level, the words to
// write with (known), the next words to introduce a few of (new), and words coming up soon that still need an example
// sentence (need_sentences: up to 30, from web/public/sentences.json).
// Run: cd web && node scripts/daily-vocab.ts [YYYY-MM-DD]

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const config = JSON.parse(readFileSync(join(root, 'content', 'config.json'), 'utf8')) as {
  curriculum: { start: string; per_day: number; basics: number }
}
const list = (JSON.parse(readFileSync(join(root, 'web', 'public', 'daily-words.json'), 'utf8')) as { words: [string, string, string][] }).words
const sentences = (JSON.parse(readFileSync(join(root, 'web', 'public', 'sentences.json'), 'utf8')) as { sentences: Record<string, unknown> }).sentences
const hsk = (JSON.parse(readFileSync(join(root, 'web', 'public', 'hsk.json'), 'utf8')) as { words: Record<string, [number, number, string]> }).words

const today = process.argv[2] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(config.curriculum.start)) / 86_400_000))
const position = Math.min(list.length, config.curriculum.basics + config.curriculum.per_day * days)
const known = list.slice(0, position).map(([h]) => h)
const fresh = list.slice(position, position + 15).map(([h, , e]) => ({ word: h, english: e }))
// The level is the HSK level of the words being learned now.
const level = Math.min(6, Math.max(1, hsk[list[Math.max(0, position - 1)][0]]?.[0] ?? 1))

// Sentences stay well ahead of the learner (80 words past the estimate), so cards always have one.
const needSentences = list
  .slice(0, position + 80)
  .filter(([h]) => !sentences[h])
  .slice(0, 30)
  .map(([h, , e]) => ({ word: h, english: e }))

console.log(JSON.stringify({ date: today, position, level, known, new: fresh, need_sentences: needSentences }, null, 1))
