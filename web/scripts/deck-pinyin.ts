// Rewrites the pinyin in the iOS build's copy of my deck (dist-native/deck.json) with the app's own reading, so the
// word-of-the-day widget (which reads that file) shows exactly what the app and the notification show: dictionary
// corrections and neutral tones (小姐 xiǎojie), 一/不 written yī/bù. Same formula as the notification (web/src/native/notifications.ts).
// Run by `npm run build:ios`; the deck in public/ (my Anki export) is left as it is.

import { readFileSync, writeFileSync } from 'node:fs'
import { tokensOfText, withAppTones, type Lexicon } from '../src/chinese/tokens.ts'

type DeckWord = { hanzi: string; pinyin: string; english: string; mastery?: string }

const file = process.argv[2] ?? 'dist-native/deck.json'
const deck = JSON.parse(readFileSync(file, 'utf8')) as { words: DeckWord[] }
const lexicon: Lexicon = new Map(deck.words.map((w) => [w.hanzi, { pinyin: w.pinyin, english: w.english, mastery: 'new' as const }]))
let changed = 0
for (const w of deck.words) {
  const pinyin = withAppTones(w.pinyin, tokensOfText(w.hanzi, lexicon).flatMap((t) => t.syllables))
  if (pinyin === w.pinyin) continue
  w.pinyin = pinyin
  changed++
}
writeFileSync(file, JSON.stringify(deck))
console.log(`deck pinyin: ${changed} of ${deck.words.length} words now match the app`)
