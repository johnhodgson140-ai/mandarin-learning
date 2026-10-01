// The one path through Chinese: a built-in word list (web/public/daily-words.json: HSK 1 → 6, most common first, made by
// scripts/build-daily-list.ts) taken a few words a day, at my pace. Today's words are the next words I haven't met yet,
// so a missed day just waits for me; they're my new Learn cards, and what I've met and rated is "my words" everywhere
// else (reader colours, story difficulty, missions). Not tied to Anki.
import { dayNumber, DEFAULT_NOTIFY, pickToday, type NotifySettings, type Word } from '../notify/plan.ts'
import { load, save } from './storage.ts'

export type { Word }

/** The iOS app tries the website first (a newer list), then the copy it was built with. */
const SOURCES = import.meta.env.MODE === 'native' ? ['https://johnhodgson140-ai.github.io/mandarin-learning/', '/'] : [import.meta.env.BASE_URL]

let list: Promise<Word[]> | null = null

/** The whole list, in order (cached after the first load). */
export function curriculumList(): Promise<Word[]> {
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

/** New words a day (Settings → Notifications → Today's words; used with or without notifications). */
export const dailyCount = () => ({ ...DEFAULT_NOTIFY.dailyWords, ...load<Partial<NotifySettings> | null>('notifications', null)?.dailyWords }).count

/** Words I've met (been given as today's words), with the day I met them: what "my words" are built from. */
export type MyWord = Word & { day: number }
export const myWords = () => load<Record<string, MyWord>>('myWords', {})

type TodaySet = { day: number; words: string[] }

/** Learn states, read straight from storage (no import of cards.ts: it imports this module). */
const rated = () => load<Record<string, unknown>>('cardStates', {})

/**
 * Today's words, fixed for the day once worked out: first any word I met before but haven't rated yet (a missed day
 * waits for me), then the next words of the list I haven't met, `count` in all.
 */
export async function todaysWords(date = new Date(), count = dailyCount()): Promise<Word[]> {
  const day = dayNumber(date)
  const mine = myWords()
  const saved = load<TodaySet | null>('todaysWords', null)
  if (saved?.day === day && saved.words.every((h) => mine[h])) return saved.words.map((h) => mine[h])
  const { carried, fresh } = pickToday({ list: await curriculumList(), met: mine, rated: rated(), day, count })
  return keepToday(day, [...carried.map((h) => mine[h]), ...fresh])
}

/** Pull ahead: `extra` more new words today. */
export async function moreWordsToday(extra: number, date = new Date()): Promise<Word[]> {
  const today = await todaysWords(date)
  return keepToday(dayNumber(date), [...today, ...(await nextUnmet(extra))])
}

async function nextUnmet(n: number, skip: ReadonlySet<string> = new Set()): Promise<Word[]> {
  if (n <= 0) return []
  const mine = myWords()
  return (await curriculumList()).filter((w) => !mine[w.hanzi] && !skip.has(w.hanzi)).slice(0, n)
}

function keepToday(day: number, words: Word[]): Word[] {
  const mine = myWords()
  for (const w of words) mine[w.hanzi] ??= { ...w, day }
  save('myWords', mine)
  save('todaysWords', { day, words: words.map((w) => w.hanzi) } satisfies TodaySet)
  return words.map((w) => mine[w.hanzi])
}

/** Today's words and my best guess for the next days (the next words of the list): for notifications and the widget. */
export async function comingDays(days: number, date = new Date()): Promise<Word[][]> {
  const today = await todaysWords(date)
  const ahead = await nextUnmet(dailyCount() * (days - 1), new Set(today.map((w) => w.hanzi)))
  return [today, ...[...Array(days - 1).keys()].map((d) => ahead.slice(d * dailyCount(), (d + 1) * dailyCount()))]
}
