// Tone listening trainer ("Tone ears"): high-variability training. I hear a syllable or a two-syllable word in
// one of several voices and pick its tones; the items I get wrong come back more often. Training the ear on many
// voices improves how the tones are produced too, and carries over to new voices and words.

import type { Syllable } from '../chinese/tokens.ts'
import { toneless, type Tone } from '../chinese/tones.ts'

export type EarItem = { text: string; syllables: Syllable[]; tones: Tone[] }
/** Per tone pattern ("3" or "3-2"): how often I've heard it and how often I got it right. */
export type EarStats = Record<string, { seen: number; right: number }>

const HAN = /^\p{Script=Han}+$/u

/**
 * Items that make a fair question: 1 or `maxSyllables` Chinese characters, every tone full (no neutral) and said
 * as written (no sandhi changes, so the answer is unambiguous).
 */
export function earItems(words: { text: string; syllables: Syllable[] }[], syllableCount: 1 | 2): EarItem[] {
  const seen = new Set<string>()
  const out: EarItem[] = []
  for (const w of words) {
    if (!HAN.test(w.text) || w.syllables.length !== syllableCount || seen.has(w.text)) continue
    if (w.syllables.some((s) => s.spoken === 5 || s.spoken !== s.written)) continue
    seen.add(w.text)
    out.push({ text: w.text, syllables: w.syllables, tones: w.syllables.map((s) => s.spoken) })
  }
  return out
}

export const patternOf = (tones: Tone[]) => tones.join('-')

/** How much to favour a pattern: unseen or often wrong patterns come up more. */
function weight(stats: EarStats, pattern: string): number {
  const s = stats[pattern]
  if (!s || s.seen === 0) return 2
  const accuracy = s.right / s.seen
  return 1 + 3 * (1 - accuracy)
}

/** Pick the next item: first a tone pattern (weighted), then a word with that pattern, never the previous one. */
export function pickItem(items: EarItem[], stats: EarStats, previous: string | null, rand = Math.random): EarItem | null {
  const pool = items.filter((i) => i.text !== previous)
  if (pool.length === 0) return items[0] ?? null
  const byPattern = new Map<string, EarItem[]>()
  for (const i of pool) {
    const p = patternOf(i.tones)
    byPattern.set(p, [...(byPattern.get(p) ?? []), i])
  }
  const patterns = [...byPattern.keys()]
  const weights = patterns.map((p) => weight(stats, p))
  let r = rand() * weights.reduce((a, b) => a + b, 0)
  let chosen = patterns[patterns.length - 1]
  for (let i = 0; i < patterns.length; i++) {
    r -= weights[i]
    if (r < 0) {
      chosen = patterns[i]
      break
    }
  }
  const words = byPattern.get(chosen)!
  return words[Math.floor(rand() * words.length)]
}

export function recordAnswer(stats: EarStats, pattern: string, right: boolean): EarStats {
  const s = stats[pattern] ?? { seen: 0, right: 0 }
  return { ...stats, [pattern]: { seen: s.seen + 1, right: s.right + (right ? 1 : 0) } }
}

/** Patterns I get wrong most (at least 3 tries), worst first. */
export function weakest(stats: EarStats, count = 3): { pattern: string; accuracy: number }[] {
  return Object.entries(stats)
    .filter(([, s]) => s.seen >= 3)
    .map(([pattern, s]) => ({ pattern, accuracy: s.right / s.seen }))
    .filter((p) => p.accuracy < 0.9)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, count)
}

/** Bundled recording names (web/public/voices/): a word by its characters' code points ("你好" → "4f60-597d"). */
export const wordKey = (text: string) => [...text].map((c) => c.codePointAt(0)!.toString(16)).join('-')
/** A syllable: tone-less pinyin with ü as v, then the tone ("lǜ" tone 4 → "lv4"), as audio-cmn names them. */
export const syllableKey = (pinyin: string, tone: number) => `${toneless(pinyin).replace(/ü/g, 'v')}${tone}`
