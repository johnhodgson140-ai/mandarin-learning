// Bundles the human recordings Tone ears uses (web/public/voices/): from a clone of github.com/hugolpz/audio-cmn
// (CC BY-SA: syllables by Chen Wang, words by Yue Tan), only the items the drill can ask, so the app stays small:
// one-syllable items get the syllable recording (and the character's, when there is one), two-syllable items the word.
// Run: node scripts/build-voices.ts path/to/audio-cmn   (a sparse clone with 24k-abr/ is enough)

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildParagraph } from '../src/chinese/tokens.ts'
import { earItems, syllableKey, wordKey } from '../src/ears/logic.ts'

const src = process.argv[2]
if (!src) throw new Error('Usage: node scripts/build-voices.ts path/to/audio-cmn')
const pub = join(import.meta.dirname, '..', 'public')
const out = join(pub, 'voices')

// The same pool as Tone ears: HSK 1–3 words, the first 1,500 words of the list, and their characters.
const hsk: Record<string, [number, number, string]> = JSON.parse(readFileSync(join(pub, 'hsk.json'), 'utf8')).words
const list: [string][] = JSON.parse(readFileSync(join(pub, 'daily-words.json'), 'utf8')).words
const words = [...new Set([...Object.entries(hsk).filter(([, v]) => v[0] <= 3).map(([w]) => w), ...list.slice(0, 1500).map(([w]) => w)])]
const tokens = [...words, ...new Set(words.flatMap((w) => [...w]))].map((w) => buildParagraph([w], new Map())[0]).filter(Boolean)
const pool = (n: 1 | 2) => earItems(tokens.map((t) => ({ text: t.text, syllables: t.syllables })), n)

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 's'), { recursive: true })
mkdirSync(join(out, 'w'), { recursive: true })
const syllables = new Set<string>()
const recorded = new Set<string>()
for (const item of pool(1)) {
  const key = syllableKey(item.syllables[0].pinyin, item.tones[0])
  const file = join(src, '24k-abr', 'syllabs', `cmn-${key}.mp3`)
  if (!syllables.has(key) && existsSync(file)) {
    copyFileSync(file, join(out, 's', `${key}.mp3`))
    syllables.add(key)
  }
}
for (const item of [...pool(1), ...pool(2)]) {
  const file = join(src, '24k-abr', 'hsk', `cmn-${item.text}.mp3`)
  if (existsSync(file)) {
    copyFileSync(file, join(out, 'w', `${wordKey(item.text)}.mp3`))
    recorded.add(wordKey(item.text))
  }
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ syllables: [...syllables].sort(), words: [...recorded].sort() }))
writeFileSync(
  join(out, 'CREDITS.md'),
  `# Recordings\n\nFrom [audio-cmn](https://github.com/hugolpz/audio-cmn) by Hugo Lopez et al., licensed\n[CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/). Syllables (s/) spoken by Chen Wang; words (w/) by Yue Tan\n(from the SWAC/Shtooka cmn-caen-tan collection). Files renamed (w/: Unicode code points) and selected; audio unchanged.\n`,
)
console.log(`${syllables.size} syllables, ${recorded.size} words → public/voices/`)
