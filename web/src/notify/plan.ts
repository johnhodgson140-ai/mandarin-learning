// Which notifications to schedule for the next week (iOS app). Pure, so it's testable: the native side
// (native/notifications.ts) gathers the inputs, cancels the old ones and schedules these.

export type Slot = { on: boolean; time: string } // "HH:MM"
export type NotifySettings = { wordOfDay: Slot; practice: Slot; streak: Slot }
export const DEFAULT_NOTIFY: NotifySettings = {
  wordOfDay: { on: false, time: '09:00' },
  practice: { on: false, time: '19:00' },
  streak: { on: false, time: '20:30' },
}

export type Word = { hanzi: string; pinyin: string; english: string }
export type Planned = { id: number; title: string; body: string; at: Date; route: string }

const DAYS_AHEAD = 7
/** Notification ids by kind (iOS keeps at most 64 pending; this uses 15). */
export const IDS = { practice: 10, wordOfDay: 20, streak: 30 }

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
  toneTip: string | null
}): Planned[] {
  const { now, settings, dueCount, practisedToday, words, toneTip } = input
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
  if (settings.streak.on) {
    // Only when I haven't practised yet today; once I have, it moves to tomorrow.
    const today = at(now, settings.streak.time, 0)
    const when = !practisedToday && today > now ? today : at(now, settings.streak.time, 1)
    out.push({ id: IDS.streak, title: 'Keep your streak 🔥', body: 'Two minutes of cards keeps it going.', at: when, route: '#speak/cards' })
  }
  return out
}
