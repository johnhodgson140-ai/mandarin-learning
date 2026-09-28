// Story text → reader tokens: per-syllable pinyin with written + spoken tones, mastery and gloss.
// Pinyin always comes from pinyin-pro (never from Claude), overridden by my Anki pinyin when the word is in Anki.

import { pinyin } from 'pinyin-pro'
import type { Mastery } from '../services/anki-mapping.ts'
import { spokenTones, type SandhiSyllable } from './sandhi.ts'
import { isHan, toneless, toneOf, type Tone } from './tones.ts'

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
  for (const word of merged) {
    const wordChars = [...word]
    const own = readings.slice(at, at + wordChars.length)
    at += wordChars.length
    const kind = kindOf(word, names)
    const entry = lexicon.get(word)
    const hanOnly = wordChars.every(isHan)
    const pieces = (entry && hanOnly && alignPinyin(entry.pinyin, own)) || own
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

/** Spoken tones per phrase; anything that isn't Chinese characters (punctuation, digits) ends a phrase. */
function applySandhi(tokens: Token[]): void {
  let phrase: { syllable: Syllable; input: SandhiSyllable }[] = []
  const flush = () => {
    const spoken = spokenTones(phrase.map((p) => p.input))
    phrase.forEach((p, i) => (p.syllable.spoken = spoken[i]))
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
