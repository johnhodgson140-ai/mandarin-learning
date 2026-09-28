// Shadowing + Retell: the pure parts (sentence picking, pace, key-word coverage).

import type { Token } from '../chinese/tokens.ts'
import { toneless } from '../chinese/tones.ts'

/** Split running text into sentences, keeping the end punctuation. */
export function sentences(text: string): string[] {
  return (text.match(/[^。！？!?]+[。！？!?]?/gu) ?? []).map((s) => s.trim()).filter((s) => /\p{Script=Han}/u.test(s))
}

/** Sentences worth shadowing: 4–25 characters of Chinese, no duplicates. */
export function shadowable(candidates: string[]): string[] {
  const seen = new Set<string>()
  return candidates.filter((s) => {
    const han = [...s].filter((c) => /\p{Script=Han}/u.test(c)).length
    if (han < 4 || han > 25 || seen.has(s)) return false
    seen.add(s)
    return true
  })
}

/** Normal Mandarin runs at about 4.5 syllables a second (Azure's voice is close to this at rate 1). */
export const SYLLABLES_PER_SECOND = 4.5

/** My pace relative to the native speaker: 1 = same speed, below 1 = slower. */
export function paceRatio(syllables: number, mySeconds: number, nativeSeconds: number | null, rate = 1): number {
  const native = nativeSeconds ?? syllables / (SYLLABLES_PER_SECOND * rate)
  return mySeconds > 0 ? Math.round((native / mySeconds) * 100) / 100 : 0
}

// Words too common to show whether I understood the story.
const FILLER = new Set([
  '我们', '你们', '他们', '她们', '什么', '这个', '那个', '一个', '没有', '就是', '可以', '因为', '所以', '但是',
  '然后', '还是', '已经', '现在', '时候', '一起', '一点', '一下', '怎么', '这里', '那里', '这样', '那样', '不是',
])

/** The story's content words (2+ characters, or names), in order, without filler. */
export function keyWords(tokens: Token[]): string[] {
  const out: string[] = []
  for (const t of tokens) {
    if (t.kind !== 'word' && t.kind !== 'name') continue
    if ((t.kind === 'word' && [...t.text].length < 2) || FILLER.has(t.text) || out.includes(t.text)) continue
    out.push(t.text)
  }
  return out
}

/**
 * Which key words my retelling mentioned, compared by sound (tone-less pinyin) so a recogniser homophone still
 * counts. `said` is the tone-less pinyin of what I said, one entry per syllable.
 */
export function coverage(keys: { word: string; pinyin: string[] }[], said: string[]): { covered: string[]; missed: string[]; share: number } {
  const heard = ` ${said.map(toneless).join(' ')} `
  const covered: string[] = []
  const missed: string[] = []
  for (const k of keys) (heard.includes(` ${k.pinyin.map(toneless).join(' ')} `) ? covered : missed).push(k.word)
  return { covered, missed, share: keys.length ? covered.length / keys.length : 0 }
}
