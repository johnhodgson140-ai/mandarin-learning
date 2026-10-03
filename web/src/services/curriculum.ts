// The one path through Chinese: a built-in word list (web/public/daily-words.json: HSK 1 → 6, most common first, made by
// scripts/build-daily-list.ts) taken a few words a day, at my pace. Today's words are the next words I haven't met yet,
// so a missed day just waits for me; they're my new Learn cards, and what I've met and rated is "my words" everywhere
// else (reader colours, story difficulty, missions). Not tied to Anki.
import { dayNumber, DEFAULT_NOTIFY, pickToday, type NotifySettings, type Word } from '../notify/plan.ts'
import { sendProgress } from './sync.ts'
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
  const saved = load<TodaySet | null>('todaysWords', null)
  const known = myWords()
  if (saved?.day === day && saved.words.length > 0 && saved.words.every((h) => known[h])) return saved.words.map((h) => known[h])
  const list = await curriculumList()
  const mine = adoptRated(list)
  const { carried, fresh } = pickToday({ list, met: mine, rated: rated(), day, count })
  const words = [...carried.map((h) => mine[h]), ...fresh]
  // The list didn't load (offline): show what's carried over, but don't fix today's set until it does.
  if (list.length === 0) return words
  return keepToday(day, words)
}

/** Pull ahead: `extra` more new words today. */
export async function moreWordsToday(extra: number, date = new Date()): Promise<Word[]> {
  const today = await todaysWords(date)
  return keepToday(dayNumber(date), [...today, ...(await nextUnmet(extra))])
}

async function nextUnmet(n: number, skip: ReadonlySet<string> = new Set()): Promise<Word[]> {
  if (n <= 0) return []
  const mine = myWords()
  const states = rated()
  return (await curriculumList()).filter((w) => !mine[w.hanzi] && !states[w.hanzi] && !skip.has(w.hanzi)).slice(0, n)
}

/**
 * Words I'd already rated in Learn before the built-in list (Anki deck, starter words…) that are on the list become
 * my words (met on day 0), with the list's pinyin and meaning: they're not new, and their reviews carry on.
 */
function adoptRated(list: Word[]): Record<string, MyWord> {
  const mine = myWords()
  const states = rated()
  let added = false
  for (const w of list) {
    if (states[w.hanzi] && !mine[w.hanzi]) {
      mine[w.hanzi] = { ...w, day: 0 }
      added = true
    }
  }
  if (added) saveMine(mine)
  return mine
}

/** Save my words (and share them with my other device when signed in to Firebase). */
export function saveMine(mine: Record<string, MyWord>): void {
  const before = myWords()
  save('myWords', mine)
  // Only the words that changed, so this never overwrites words my other device added.
  for (const [hanzi, w] of Object.entries(mine)) if (before[hanzi]?.day !== w.day) sendProgress(`myWords/${encodeURIComponent(hanzi)}`, w)
}

function keepToday(day: number, words: Word[]): Word[] {
  const mine = myWords()
  for (const w of words) mine[w.hanzi] ??= { ...w, day }
  saveMine(mine)
  save('todaysWords', { day, words: words.map((w) => w.hanzi) } satisfies TodaySet)
  return words.map((w) => mine[w.hanzi])
}

/** Today's words and my best guess for the next days (the next words of the list): for notifications and the widget. */
export async function comingDays(days: number, date = new Date()): Promise<Word[][]> {
  const today = await todaysWords(date)
  const n = dailyCount()
  // Tomorrow starts with words I've met but not rated yet (today's, and any met in a story or mission), as the real
  // pick does; then new ones. Later days: new ones.
  const states = rated()
  const carry = Object.values(myWords())
    .filter((w) => !states[w.hanzi])
    .sort((a, b) => a.day - b.day)
    .slice(0, n)
  const ahead = await nextUnmet(n * (days - 1), new Set(today.map((w) => w.hanzi)))
  const sets = [today]
  let next = 0
  for (let d = 1; d < days; d++) {
    const take = d === 1 ? n - carry.length : n
    sets.push([...(d === 1 ? carry : []), ...ahead.slice(next, next + take)])
    next += take
  }
  return sets
}
