// When a card comes back after each button, in one of three modes I can switch between:
// - standard: FSRS as is (fitted to me once that predicts better: cards/fit.ts),
// - adjusted: FSRS with my multipliers for Hard / Good / Easy,
// - fixed: my own times for each button (e.g. Again 5 min, Hard 10 min, Good 30 min, Easy 1 day), for learning a
//   batch of words in one sitting. FSRS still tracks each word's memory underneath, so switching back is seamless.

import { DEFAULT_SCALE, rateCard, type CardState, type IntervalScale, type Rating } from './srs.ts'

export type TimingMode = 'standard' | 'adjusted' | 'fixed'
/** Minutes until a card comes back, per button. */
export type FixedTimes = { again: number; hard: number; good: number; easy: number }

const HOUR = 60
const DAY = 24 * HOUR
export const DEFAULT_FIXED: FixedTimes = { again: 5, hard: 10, good: 30, easy: DAY }

/** Quick choices for fixed times. */
export const FIXED_PRESETS: { name: string; times: FixedTimes }[] = [
  { name: 'Learn', times: DEFAULT_FIXED },
  { name: 'Cram', times: { again: 1, hard: 5, good: 10, easy: HOUR } },
  { name: 'Gentle', times: { again: 10, hard: HOUR, good: DAY, easy: 4 * DAY } },
]

/** The times each button can be set to, in minutes. */
export const FIXED_CHOICES = [1, 5, 10, 15, 30, HOUR, 4 * HOUR, DAY, 2 * DAY, 4 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]

export const RATING_KEY: Record<Rating, keyof FixedTimes> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }

export type Timing = { mode: TimingMode; scale: IntervalScale; fixed: FixedTimes; params?: readonly number[] }

/** Rate a card under my chosen timing. */
export function schedule(state: CardState | undefined, g: Rating, now: number, score: number | null, t: Timing): CardState {
  const next = rateCard(state, g, now, score, t.mode === 'adjusted' ? t.scale : DEFAULT_SCALE, t.params)
  return t.mode === 'fixed' ? { ...next, due: now + t.fixed[RATING_KEY[g]] * 60_000 } : next
}

/** "5m", "1h", "3d", "2mo", "1.5y": how long until `due`, as Anki shows it on its buttons. */
export function whenText(due: number, now: number): string {
  const minutes = Math.max(0, Math.round((due - now) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < HOUR) return `${minutes}m`
  if (minutes < DAY) return `${Math.round(minutes / HOUR)}h`
  const days = Math.round(minutes / DAY)
  return days < 30 ? `${days}d` : days < 365 ? `${Math.round(days / 30)}mo` : `${(days / 365).toFixed(1)}y`
}

/** A minutes value as words for the settings: 5 → "5 min", 60 → "1 hour", 1440 → "1 day". */
export function minutesLabel(m: number): string {
  if (m < HOUR) return `${m} min`
  if (m < DAY) return `${m / HOUR} hour${m === HOUR ? '' : 's'}`
  if (m === 7 * DAY) return '1 week'
  if (m === 14 * DAY) return '2 weeks'
  return `${m / DAY} day${m === DAY ? '' : 's'}`
}
