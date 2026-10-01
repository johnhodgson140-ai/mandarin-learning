// Today's words: a few words a day from the built-in list (web/public/daily-words.json: HSK 1 → 6, most common first,
// made by scripts/build-daily-list.ts), in order (notify/plan.ts: dailyWords). Not tied to Anki. The widget reads the
// same file from the app (ShuoWidgets/DeckWord.swift: DeckWord.dailyList), so both always show the same words.
import { dailyWords, DEFAULT_NOTIFY, type NotifySettings, type Word } from '../notify/plan.ts'
import { load, save } from './storage.ts'

/** The iOS app tries the website first (a newer list), then the copy it was built with. */
const SOURCES = import.meta.env.MODE === 'native' ? ['https://johnhodgson140-ai.github.io/mandarin-learning/', '/'] : [import.meta.env.BASE_URL]

let list: Promise<Word[]> | null = null

/** The whole list, in order (cached after the first load). */
export function dailyWordList(): Promise<Word[]> {
  list ??= (async () => {
    for (const base of SOURCES) {
      try {
        const res = await fetch(`${base}daily-words.json`)
        if (res.ok) {
          const json = (await res.json()) as { words: [string, string, string][] }
          return json.words.map(([hanzi, pinyin, english]) => ({ hanzi, pinyin, english }))
        }
      } catch {
        // offline: try the next source
      }
    }
    list = null
    return []
  })()
  return list
}

/** How many words a day (Settings → Notifications → Today's words; also used without notifications). */
export const dailyCount = () => ({ ...DEFAULT_NOTIFY.dailyWords, ...load<Partial<NotifySettings> | null>('notifications', null)?.dailyWords }).count

export async function todaysWords(date = new Date()): Promise<Word[]> {
  return dailyWords(date, await dailyWordList(), dailyCount())
}

/** Words I chose to learn from Today's words: they become Learn cards (and then Recall) even if they're not in Anki. */
export const dailyCards = () => load<Word[]>('dailyCards', [])

export function addDailyCards(words: Word[]): void {
  const have = new Set(dailyCards().map((w) => w.hanzi))
  save('dailyCards', [...dailyCards(), ...words.filter((w) => !have.has(w.hanzi))])
}
