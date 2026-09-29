// Builds the ready-made pack the app offers with no API key: web/public/pack/{stories,missions}.json.
// Sources are written by Claude in content/pack/ (stories as plain paragraphs, no pinyin); this script
// splits them into words, works out the new words (not in my deck) and glosses them from hsk.json.
// Run: cd web && npm run pack   (the tests fail if the output isn't valid)

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { validatePack, type GuidedMission, type PackStory } from '../src/daily/schema.ts'

type SourceStory = Omit<PackStory, 'paragraphs' | 'new_words' | 'glossary'> & {
  paragraphs: string[]
  /** English for names and for words hsk.json doesn't have. */
  glossary?: Record<string, string>
}

const root = join(import.meta.dirname, '..', '..')
const src = join(root, 'content', 'pack')
const out = join(root, 'web', 'public', 'pack')

const hsk: Record<string, [number, number, string]> = JSON.parse(readFileSync(join(root, 'web', 'public', 'hsk.json'), 'utf8')).words
const deck = new Set<string>(JSON.parse(readFileSync(join(root, 'content', 'words.json'), 'utf8')).deck)
const HAN = /\p{Script=Han}/u
const MAX_NEW = 8
const NUMBER = /^[零〇一二三四五六七八九十两百千万亿]+$/u

const readAll = <T>(dir: string): T[] =>
  readdirSync(join(src, dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(src, dir, f), 'utf8')) as T[])

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })

/** Longest-match split of one segment into dictionary words (single characters as a last resort). */
function split(text: string, known: (w: string) => boolean): string[] {
  const chars = [...text]
  const parts: string[] = []
  for (let i = 0; i < chars.length; ) {
    let n = Math.min(4, chars.length - i)
    while (n > 1 && !known(chars.slice(i, i + n).join(''))) n--
    parts.push(chars.slice(i, i + n).join(''))
    i += n
  }
  return parts
}

/** Paragraph → words: the ICU segmenter, then names/dictionary words merged back together and unknown chunks split. */
function words(paragraph: string, known: (w: string) => boolean): string[] {
  const segs = [...segmenter.segment(paragraph)].map((s) => s.segment).filter((s) => s.trim())
  const merged: string[] = []
  for (let i = 0; i < segs.length; ) {
    let taken = 1
    for (let n = Math.min(4, segs.length - i); n > 1; n--) {
      const joined = segs.slice(i, i + n).join('')
      if (HAN.test(joined) && [...joined].length <= 6 && known(joined)) {
        taken = n
        break
      }
    }
    merged.push(segs.slice(i, i + taken).join(''))
    i += taken
  }
  return merged.flatMap((w) => (!HAN.test(w) || known(w) || NUMBER.test(w) ? [w] : split(w, known)))
}

/** Short English from hsk.json: the first two plain senses (skipping "(of an animal) …" style notes). */
const COMMON: Record<string, string> = {
  第: 'ordinal prefix (第一 = first)',
  得: 'links a verb to how it is done (跑得快 = runs fast)',
  地: 'turns a word into an adverb (慢慢地 = slowly)',
  着: 'ongoing state (坐着 = sitting)',
  过: 'have done before (去过 = have been)',
  了: 'completed action; change of state',
  吧: 'suggestion particle (走吧 = let\'s go)',
  呢: 'question particle (你呢？= and you?)',
  把: 'moves the object before the verb (把门关上)',
  被: 'passive marker (被偷了 = was stolen)',
}

function gloss(w: string): string | undefined {
  if (COMMON[w]) return COMMON[w]
  const senses = hsk[w]?.[2].split(/;\s*/)
  if (!senses) return undefined
  const plain = senses.filter((x) => !x.startsWith('(') && !/variant of|surname/i.test(x))
  return (plain.length ? plain : senses).slice(0, 2).join('; ')
}

function build(s: SourceStory): PackStory {
  const manual = s.glossary ?? {}
  const known = (w: string) => w in hsk || deck.has(w) || w in manual || s.names.includes(w)
  const paragraphs = s.paragraphs.map((p) => words(p, known))
  const isNew = (w: string) => HAN.test(w) && !NUMBER.test(w) && !s.names.includes(w) && !deck.has(w) && (w in manual || w in hsk)
    // A word made entirely of deck words (很好 = 很 + 好) isn't new.
    && !split(w, (x) => deck.has(x)).every((x) => deck.has(x))
  const unknown = [...new Set(paragraphs.flat().filter(isNew))]
  // Every unknown word gets a gloss, but only the 8 most useful become new words (and so flashcards):
  // the ones glossed by hand first, then the most common.
  const rank = (w: string) => (w in manual ? -1 : (hsk[w]?.[1] ?? Infinity))
  const newWords = [...unknown].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_NEW)
  const glossary = [...new Set([...s.names, ...unknown])]
    .map((word) => ({ word, english: manual[word] ?? gloss(word) ?? '' }))
    .filter((g) => g.english)
  return { ...s, paragraphs, new_words: newWords, glossary }
}

const stories = readAll<SourceStory>('stories').map(build)
const missions = readAll<GuidedMission>('missions')
const pack = { stories, missions }
const errors = validatePack(pack)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'stories.json'), JSON.stringify({ stories }))
writeFileSync(join(out, 'missions.json'), JSON.stringify({ missions }))
const chars = (st: PackStory) => st.paragraphs.flat().join('').length
console.log(`${stories.length} stories (${stories.reduce((n, st) => n + chars(st), 0)} characters), ${missions.length} missions`)
for (const st of stories) console.log(`  ${st.id}  L${st.level} ${st.length.padEnd(6)} ${chars(st)} 字  ${st.new_words.length} new`)
