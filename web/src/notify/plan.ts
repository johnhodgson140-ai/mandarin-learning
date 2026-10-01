// Which notifications to schedule for the next week (iOS app). Pure, so it's testable: the native side
// (native/notifications.ts) gathers the inputs, cancels the old ones and schedules these.

export type Slot = { on: boolean; time: string } // "HH:MM"
/** Today's words: `count` words a day, one at a time between `from` and `to`, then a recap of all of them at `to`. */
export type DailyWordsSlot = { on: boolean; count: number; from: string; to: string }
export type NotifySettings = { wordOfDay: Slot; practice: Slot; streak: Slot; dailyWords: DailyWordsSlot }
export const DEFAULT_NOTIFY: NotifySettings = {
  wordOfDay: { on: false, time: '09:00' },
  practice: { on: false, time: '19:00' },
  streak: { on: false, time: '20:30' },
  dailyWords: { on: false, count: 5, from: '09:00', to: '21:00' },
}
export const DAILY_COUNTS = [3, 5, 8, 10]

export type Word = { hanzi: string; pinyin: string; english: string }
export type Planned = { id: number; title: string; body: string; at: Date; route: string }

const DAYS_AHEAD = 7
/** Today's words are planned 3 days ahead (up to 11 a day): with the rest, under iOS's limit of 64 pending. */
export const DAILY_DAYS = 3
/** Notification ids by kind. Today's words: 100 + day × 20 + word (recap at + 15). */
export const IDS = { practice: 10, wordOfDay: 20, streak: 30, dailyWords: 100 }
export const dailyWordIds = () => [...Array(DAILY_DAYS).keys()].flatMap((d) => [...Array(16).keys()].map((i) => IDS.dailyWords + d * 20 + i))

/** Calendar day number of a local date (days since 1970-01-01), the same on every device and in the widget. */
export const dayNumber = (date: Date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
/** Today's words started on 1 October 2026 with the first words of my deck. */
const DAILY_START = Date.UTC(2026, 9, 1) / 86_400_000

/**
 * Today's words: the next `count` words of my deck in deck order, a new set each day, round and round the deck.
 * Mirrored in the widget (web/ios/App/ShuoWidgets/DeckWord.swift: DeckWord.daily): keep them in step.
 */
export function dailyWords<T>(date: Date, words: T[], count: number): T[] {
  const n = Math.min(count, words.length)
  if (n === 0) return []
  const start = ((((dayNumber(date) - DAILY_START) * count) % words.length) + words.length) % words.length
  return [...Array(n).keys()].map((i) => words[(start + i) % words.length])
}

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
const clock = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

function at(day: Date, time: string, plusDays: number): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(day)
  d.setDate(d.getDate() + plusDays)
  d.setHours(h, m, 0, 0)
  return d
}

/** Same word all day, a different one each day, spread through my words. */
export function wordFor(date: Date, words: Word[]): Word | null {
  if (words.length === 0) return null
  const day = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000)
  return words[(day * 7919) % words.length]
}

export function planNotifications(input: {
  now: Date
  settings: NotifySettings
  dueCount: number
  practisedToday: boolean
  words: Word[]
  /** My deck in deck order, for today's words (defaults to `words`). */
  deckOrder?: Word[]
  toneTip: string | null
}): Planned[] {
  const { now, settings, dueCount, practisedToday, words, toneTip } = input
  const deckOrder = input.deckOrder ?? words
  const out: Planned[] = []
  for (let d = 0; d < DAYS_AHEAD; d++) {
    if (settings.wordOfDay.on) {
      const when = at(now, settings.wordOfDay.time, d)
      const word = wordFor(when, words)
      if (word && when > now)
        out.push({
          id: IDS.wordOfDay + d,
          title: `今天的词 · ${word.hanzi}`,
          body: `${word.hanzi} ${word.pinyin}${word.english ? ` — ${word.english}` : ''}. Tap to say it.${toneTip ? `\n${toneTip}` : ''}`,
          at: when,
          route: '#speak/cards',
        })
    }
    if (settings.practice.on) {
      const when = at(now, settings.practice.time, d)
      if (when > now)
        out.push({
          id: IDS.practice + d,
          title: 'Shuō 说',
          // Today's count is known now; later days get a general nudge (refreshed each time the app opens).
          body: d === 0 && dueCount > 0 ? `${dueCount} card${dueCount === 1 ? ' is' : 's are'} ready to say out loud.` : 'A few minutes of speaking today?',
          at: when,
          route: '#speak/cards',
        })
    }
  }
  if (settings.dailyWords.on) {
    const { count, from, to } = settings.dailyWords
    // Spread the words evenly from `from`, leaving `to` for the recap.
    const start = minutes(from)
    const end = Math.max(start + count, minutes(to))
    const gap = (end - start) / count
    for (let d = 0; d < DAILY_DAYS; d++) {
      const day = at(now, from, d)
      const set = dailyWords(day, deckOrder, count)
      set.forEach((word, i) => {
        const when = at(now, clock(Math.round(start + i * gap)), d)
        if (when > now)
          out.push({
            id: IDS.dailyWords + d * 20 + i,
            title: `${word.hanzi} · ${word.pinyin}`,
            body: `${word.english}${word.english ? ' · ' : ''}word ${i + 1} of ${set.length} today`,
            at: when,
            route: '#speak/words',
          })
      })
      const recap = at(now, clock(end), d)
      if (set.length && recap > now)
        out.push({
          id: IDS.dailyWords + d * 20 + 15,
          title: '今天的词 · today’s words',
          body: set.map((w) => `${w.hanzi} ${w.pinyin}`).join(' · ') + '. Tap to say them.',
          at: recap,
          route: '#speak/words',
        })
    }
  }
  if (settings.streak.on) {
    // Only when I haven't practised yet today; once I have, it moves to tomorrow.
    const today = at(now, settings.streak.time, 0)
    const when = !practisedToday && today > now ? today : at(now, settings.streak.time, 1)
    out.push({ id: IDS.streak, title: 'Keep your streak 🔥', body: 'Two minutes of cards keeps it going.', at: when, route: '#speak/cards' })
  }
  return out
}
