// Today's words: a few words from my deck each day, in deck order (notify/plan.ts: dailyWords). The same list the
// widget reads from the app's deck.json (ShuoWidgets/DeckWord.swift: DeckWord.all), so both show the same words.
import { tokensOfText, withAppTones } from '../chinese/tokens.ts'
import { dailyWords, DEFAULT_NOTIFY, type NotifySettings, type Word } from '../notify/plan.ts'
import { load } from './storage.ts'
import { deckWords, getLexicon } from './words.ts'

const SENTENCE = /[，。？！,.?!…]/

/** Words (not sentences) with a meaning, up to 4 characters, first of each, in deck order; pinyin as the app reads it. */
export function dailyWordList(): Word[] {
  const lexicon = getLexicon()
  const seen = new Set<string>()
  return deckWords()
    .filter((w) => !SENTENCE.test(w.hanzi) && w.english && [...w.hanzi].length <= 4 && !seen.has(w.hanzi) && seen.add(w.hanzi))
    .map((w) => ({
      hanzi: w.hanzi,
      pinyin: withAppTones(w.pinyin, tokensOfText(w.hanzi, lexicon).flatMap((t) => t.syllables)),
      english: w.english.split(/[;,]/)[0].trim(),
    }))
}

/** How many words a day (Settings → Notifications → Today's words; also used without notifications). */
export const dailyCount = () => ({ ...DEFAULT_NOTIFY.dailyWords, ...load<Partial<NotifySettings> | null>('notifications', null)?.dailyWords }).count

export const todaysWords = (date = new Date()) => dailyWords(date, dailyWordList(), dailyCount())
