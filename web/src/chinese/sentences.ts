// Example sentences for words (web/public/sentences.json): one short, everyday sentence per word, with English.
// Written ahead of time by Claude (the daily session adds them for upcoming words); pinyin is never stored, the app
// makes it. Pure rules, shared by the tests and scripts/daily-vocab.ts.

import { tokensOfText } from './tokens.ts'

/** hanzi → [Chinese sentence, English]. */
export type Sentences = Record<string, [string, string]>

const LATIN = /[A-Za-z]/

/**
 * What's wrong with a sentence for `word` (empty when it's fine). `rank` is each word's place in the word list
 * (most common first): every other word in the sentence must be one a learner meets by then, or soon after
 * (within 300 words of this one, and anything in the first 1,100 words, HSK 1–2, is fine).
 */
export function sentenceErrors(word: string, zh: string, en: string, rank: Map<string, number>): string[] {
  const errors: string[] = []
  if (!zh.includes(word)) errors.push(`doesn't contain ${word}`)
  if (!en.trim()) errors.push('no English')
  if (LATIN.test(zh)) errors.push('Latin letters in the Chinese')
  if ([...zh].length > 20) errors.push('longer than 20 characters')
  const limit = Math.max((rank.get(word) ?? 0) + 300, 1100)
  const easy = (text: string): boolean => {
    if ((rank.get(text) ?? Infinity) <= limit || text === '儿') return true
    // The browser's word splitter joins some words (不知道, 什么时候): fine if they're made of easy words.
    for (let i = text.length - 1; i > 0; i--) if ((rank.get(text.slice(0, i)) ?? Infinity) <= limit && easy(text.slice(i))) return true
    return false
  }
  const hard = tokensOfText(zh)
    .filter((t) => t.syllables.length > 0 && !easy(t.text))
    .map((t) => t.text)
  if (hard.length) errors.push(`words too far ahead: ${hard.join(' ')}`)
  return errors
}
