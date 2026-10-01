// Story text → reader tokens: per-syllable pinyin with written + spoken tones, mastery and gloss.
// Pinyin always comes from pinyin-pro (never from Claude), overridden by my Anki pinyin when the word is in Anki.

import { pinyin } from 'pinyin-pro'
import type { Mastery } from '../services/anki-mapping.ts'
import FIXES from './pinyin-fixes.json' with { type: 'json' }
import { contextReading } from './polyphones.ts'
import { spokenTones, type SandhiSyllable } from './sandhi.ts'
import { isHan, markTone, toneless, toneOf, type Tone } from './tones.ts'

export type LexiconEntry = { pinyin: string; english: string; mastery: Mastery }
/** My Anki words by hanzi. */
export type Lexicon = ReadonlyMap<string, LexiconEntry>

export type Syllable = { hanzi: string; pinyin: string; written: Tone; spoken: Tone }
export type TokenKind = 'word' | 'name' | 'number' | 'other'
export type Token = {
  text: string
  kind: TokenKind
  syllables: Syllable[]
  /** Only for kind 'word': Anki mastery, or 'unknown' when the word isn't in Anki. */
  mastery: Mastery | 'unknown' | null
  gloss: string
}

const MASTERY_ORDER: Mastery[] = ['new', 'learning', 'young', 'mature']
const CHINESE_NUMBER = /^[零〇一二三四五六七八九十两百千万亿]+$/u
const DIGITS = /^[\d０-９.,%]+$/u

/** Merge adjacent tokens that together form an Anki word (Claude split 卖 + 家, Anki has 卖家). */
export function mergeWithLexicon(words: string[], lexicon: Lexicon): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; ) {
    let taken = 1
    for (let n = Math.min(4, words.length - i); n > 1; n--) {
      if (lexicon.has(words.slice(i, i + n).join(''))) {
        taken = n
        break
      }
    }
    out.push(words.slice(i, i + taken).join(''))
    i += taken
  }
  return out
}

/** Mastery for a word: exact Anki match, else the weakest part if it splits entirely into Anki words. */
export function masteryOf(word: string, lexicon: Lexicon): Mastery | 'unknown' {
  const exact = lexicon.get(word)
  if (exact) return exact.mastery
  const chars = [...word]
  // best[i] = strongest "weakest part" for chars[0..i), or -1 if not splittable.
  const best: number[] = [MASTERY_ORDER.length, ...chars.map(() => -1)]
  for (let end = 1; end <= chars.length; end++) {
    for (let start = Math.max(0, end - 4); start < end; start++) {
      if (best[start] < 0) continue
      const entry = lexicon.get(chars.slice(start, end).join(''))
      if (entry) best[end] = Math.max(best[end], Math.min(best[start], MASTERY_ORDER.indexOf(entry.mastery)))
    }
  }
  const result = best[chars.length]
  return result >= 0 && chars.length > 1 ? MASTERY_ORDER[result] : 'unknown'
}

/**
 * Anki writes pinyin without syllable breaks ("xièxie"). If it has the same letters as pinyin-pro's
 * syllables, cut it at the same places so each character gets Anki's reading and tones.
 */
export function alignPinyin(anki: string, syllables: string[]): string[] | null {
  if (toneless(anki) !== toneless(syllables.join(''))) return null
  const out: string[] = []
  const chars = [...anki.normalize('NFC')]
  let pos = 0
  for (const s of syllables) {
    let need = toneless(s).length
    let piece = ''
    while (pos < chars.length && need > 0) {
      const c = chars[pos++]
      if (toneless(c)) need--
      if (/[\s']/.test(c)) continue
      piece += c
    }
    out.push(piece)
  }
  return out
}

function kindOf(text: string, names: ReadonlySet<string>): TokenKind {
  if (![...text].some(isHan)) return DIGITS.test(text) ? 'number' : 'other'
  if (names.has(text)) return 'name'
  if (CHINESE_NUMBER.test(text) && text !== '一' && text !== '两') return 'number'
  return 'word'
}

/** Build one paragraph's tokens from Claude's word split. */
export function buildParagraph(
  words: string[],
  lexicon: Lexicon,
  names: ReadonlySet<string> = new Set(),
  glossary: ReadonlyMap<string, string> = new Map(),
): Token[] {
  const merged = mergeWithLexicon(words.filter((w) => w.length > 0), lexicon)
  const text = merged.join('')
  const chars = [...text]
  let readings = pinyin(text, { type: 'array', toneSandhi: false }) as string[]
  if (readings.length !== chars.length) readings = chars.map((c) => (isHan(c) ? (pinyin(c, { toneSandhi: false }) as string) : c))

  const tokens: Token[] = []
  let at = 0
  for (const [index, word] of merged.entries()) {
    const wordChars = [...word]
    const own = readings.slice(at, at + wordChars.length)
    at += wordChars.length
    const kind = kindOf(word, names)
    const entry = lexicon.get(word)
    const hanOnly = wordChars.every(isHan)
    const pieces = hanOnly ? pinyinFor(word, wordChars.length, merged, index, entry?.pinyin, own) : own
    const syllables: Syllable[] = hanOnly
      ? wordChars.map((hanzi, i) => {
          const tone = toneOf(pieces[i])
          return { hanzi, pinyin: pieces[i], written: tone, spoken: tone }
        })
      : []
    tokens.push({
      text: word,
      kind,
      syllables,
      mastery: kind === 'word' ? masteryOf(word, lexicon) : null,
      gloss: entry?.english ?? glossary.get(word) ?? '',
    })
  }
  applySandhi(tokens)
  return tokens
}

const DICTIONARY: Readonly<Record<string, string>> = FIXES

/** Words where 儿 is a real syllable (daughter, baby…); anywhere else at the end of a word it's the erhua r (点儿). */
const ER_SYLLABLE = /^儿|[女婴幼孤健男胎少宠混生]儿$/

/** Words where a final 子 keeps its full tone (君子, 女子, 电子); anywhere else it's the neutral suffix (扣子 kòu zi). */
const ZI_FULL = /(君|孔|老|孟|庄|墨|荀|男|女|电|原|分|因|瓜|莲|棋|弟|天|太|王|公|游|赤|学|才|孝|夫|骄|精|卵|离|质|中|量|粒|孢|臣|士)子$/

/** Word-final 儿 and 子 as suffixes: 点儿 diǎn r, 袖子 xiù zi. */
function erhua(word: string, pieces: string[]): string[] {
  if (word.length < 2) return pieces
  if (word.endsWith('儿') && !ER_SYLLABLE.test(word)) return [...pieces.slice(0, -1), 'r']
  if (word.endsWith('子') && pieces.at(-1) === 'zǐ' && !ZI_FULL.test(word)) return [...pieces.slice(0, -1), 'zi']
  return pieces
}

/**
 * Written pinyin for one word, best source first: the context rule for a one-character word (踢得 de), the dictionary
 * where pinyin-pro is wrong (朋友 péng you), my Anki pinyin, then pinyin-pro. 一 and 不 start from yī / bù (or neutral)
 * so the sandhi rules can work out the tone said, which is then written (applySandhi).
 */
function pinyinFor(word: string, length: number, words: readonly string[], index: number, anki: string | undefined, own: string[]): string[] {
  // A word on its own (a flashcard) has no neighbours to go by: my Anki reading says which one is meant (只 zhī, 了 le).
  if (length === 1 && words.length === 1 && anki && toneless(anki).length) return [anki.replace(/[\s']/g, '')]
  const context = length === 1 ? contextReading(words, index) : null
  const fixed = DICTIONARY[word]?.split(' ')
  // A whole word is read on its own (as a dictionary would), not from the sentence around it: pinyin-pro's
  // sentence mode sometimes drops neutral tones it gets right for the word alone (孩子 hái zi).
  const alone = length > 1 ? (pinyin(word, { type: 'array', toneSandhi: false }) as string[]) : own
  const base = alone.length === length ? erhua(word, alone) : own
  const pieces = (context && [context]) || (fixed?.length === length && fixed) || (anki && alignPinyin(anki, base)) || base
  // Undo sandhi already written in (Anki's yíyàng, búkèqi); neutral 不 (对不起 duì bu qǐ) stays as it is.
  const chars = [...word]
  return pieces.map((p, i) => (chars[i] === '一' && (p === 'yí' || p === 'yì') ? 'yī' : chars[i] === '不' && p === 'bú' ? 'bù' : p))
}

/** Spoken tones per phrase; anything that isn't Chinese characters (punctuation, digits) ends a phrase. */
function applySandhi(tokens: Token[]): void {
  let phrase: { syllable: Syllable; input: SandhiSyllable }[] = []
  const flush = () => {
    const spoken = spokenTones(phrase.map((p) => p.input))
    phrase.forEach((p, i) => {
      p.syllable.spoken = spoken[i]
      // 一 and 不 are written with the tone actually said, as textbooks do (一起 yìqǐ, 不是 bú shì); 3+3 isn't.
      if ((p.syllable.hanzi === '一' || p.syllable.hanzi === '不') && spoken[i] !== p.syllable.written) p.syllable.pinyin = markTone(toneless(p.syllable.pinyin), spoken[i])
    })
    phrase = []
  }
  for (const token of tokens) {
    if (token.syllables.length === 0) {
      flush()
      continue
    }
    token.syllables.forEach((syllable, i) =>
      phrase.push({
        syllable,
        input: { hanzi: syllable.hanzi, written: syllable.written, wordFinal: i === token.syllables.length - 1 && i > 0 },
      }),
    )
  }
  flush()
}

/**
 * Share of a story's words I've learned (rated in Learn), straight from its word split (no pinyin needed): for picking
 * stories I can mostly read. Punctuation, numbers and names don't count.
 */
export function shareKnown(paragraphs: string[][], names: Iterable<string>, lexicon: Lexicon): number {
  const skip = new Set(names)
  let known = 0
  let total = 0
  for (const w of paragraphs.flat()) {
    if (![...w].some(isHan) || skip.has(w) || CHINESE_NUMBER.test(w)) continue
    total++
    if (masteryOf(w, lexicon) !== 'unknown' && masteryOf(w, lexicon) !== 'new') known++
  }
  return total ? known / total : 0
}

/** Share of real words (not punctuation, numbers or names) that are known = young or mature in Anki. */
export function knownRatio(tokens: Iterable<Token>): { known: number; total: number; ratio: number } {
  let known = 0
  let total = 0
  for (const t of tokens) {
    if (t.kind !== 'word') continue
    total++
    if (t.mastery === 'young' || t.mastery === 'mature') known++
  }
  return { known, total, ratio: total === 0 ? 1 : known / total }
}

const wordSplitter = new Intl.Segmenter('zh', { granularity: 'word' })

/** Free text (a card, a sentence, what the recogniser heard) split into words and read like a story. */
export function tokensOfText(text: string, lexicon: Lexicon = new Map()): Token[] {
  return buildParagraph([...wordSplitter.segment(text)].map((s) => s.segment), lexicon)
}

/** Pinyin for each Chinese character of free text, read the same way as stories. */
export function pinyinOfText(text: string): string[] {
  return tokensOfText(text).flatMap((t) => t.syllables.map((s) => s.pinyin))
}

/** Pinyin as one line, written the usual way: words apart, syllables joined, ' before a/e/o (nǚ'ér, wǎn'ān). */
export function pinyinLine(tokens: Token[]): string {
  return tokens
    .filter((t) => t.syllables.length)
    .map((t) => t.syllables.map((s, i) => (i > 0 && /^[aeoāáǎàēéěèōóǒò]/i.test(s.pinyin) ? `'${s.pinyin}` : s.pinyin)).join(''))
    .join(' ')
}

/**
 * My Anki pinyin ("wǒ huì shuō yìdiǎnr Zhōngwén?") restyled with the app's reading, syllable by syllable: Anki's spaces,
 * capitals and punctuation are kept, the tone marks are the app's. If the letters don't line up (a different reading),
 * Anki's is kept as it is.
 */
export function withAppTones(anki: string, syllables: Syllable[]): string {
  const letters = [...anki.normalize('NFC')]
  const isLetter = (c: string) => toneless(c).length > 0
  let out = ''
  let pos = 0
  for (const s of syllables) {
    const want = toneless(s.pinyin)
    // Copy separators (spaces, apostrophes, punctuation) up to the next letter.
    while (pos < letters.length && !isLetter(letters[pos])) out += letters[pos++]
    const piece = letters.slice(pos, pos + [...want].length).join('')
    if (toneless(piece) !== want) return anki
    const capital = piece[0] !== piece[0].toLowerCase()
    out += capital ? s.pinyin[0].toUpperCase() + s.pinyin.slice(1) : s.pinyin
    pos += [...want].length
  }
  const rest = letters.slice(pos).join('')
  return rest.split('').some(isLetter) ? anki : out + rest
}
