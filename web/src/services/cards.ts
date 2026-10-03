// My cards: the words I've met through Today's words (new ones come from there, a few a day), plus any word I already
// have Learn progress on from before (Anki deck, stories, missions), so its reviews carry on.
import { fitParams, paramsFrom, type Fit, type Review } from '../cards/fit.ts'
import { DEFAULT_FIXED, schedule, type FixedTimes, type Timing, type TimingMode } from '../cards/timing.ts'
import { DEFAULT_SCALE, mergeCards, pickRecallSession, pickSession, type Card, type CardState, type IntervalScale, type Rating } from '../cards/srs.ts'
import type { Session } from '../missions/logic.ts'
import { dayNumber } from '../notify/plan.ts'
import { dayKey } from '../progress/logic.ts'
import { myWords } from './curriculum.ts'
import { sendProgress } from './sync.ts'
import { load, save } from './storage.ts'
import { listStories } from './library.ts'
import { deckWords, getLexicon } from './words.ts'

export function allCards(): Card[] {
  const met: Card[] = Object.values(myWords())
    .sort((a, b) => a.day - b.day)
    .map((w) => ({ hanzi: w.hanzi, english: w.english, source: 'daily' as const }))
  // Any other word I've rated (before the built-in list: Anki, starter words, stories, missions) stays a card so its
  // reviews carry on, with its meaning from wherever the app knew it.
  const states = cardStates('learn')
  const before: Card[] = [
    ...deckWords().map((w) => ({ hanzi: w.hanzi, english: w.english, source: 'anki' as const })),
    ...load<{ hanzi: string; english: string }[]>('words', []).map((w) => ({ hanzi: w.hanzi, english: w.english, source: 'anki' as const })),
    ...load<{ hanzi: string; english: string }[]>('dailyCards', []).map((w) => ({ hanzi: w.hanzi, english: w.english, source: 'daily' as const })),
    ...listStories().flatMap((s) => s.newWords.map((w) => ({ hanzi: w, english: s.glossary[w] ?? '', source: 'story' as const }))),
    ...load<Session[]>('sessions', []).flatMap((s) => (s.report?.new_words ?? []).map((w) => ({ hanzi: w.word, english: w.english, source: 'mission' as const }))),
  ].filter((c) => states[c.hanzi])
  const lexicon = getLexicon()
  const rest: Card[] = Object.keys(states).map((hanzi) => ({ hanzi, english: lexicon.get(hanzi)?.english ?? '', source: 'app' as const }))
  return mergeCards(met, before, rest)
}

/** Today's words I haven't rated in Learn yet: my new Learn cards (synchronous, from the set saved for today). */
export function todaysNewCards(date = new Date()): Card[] {
  const saved = load<{ day: number; words: string[] } | null>('todaysWords', null)
  if (saved?.day !== dayNumber(date)) return []
  const mine = myWords()
  const states = cardStates('learn')
  return saved.words.filter((h) => mine[h] && !states[h]).map((h) => ({ hanzi: h, english: mine[h].english, source: 'daily' as const }))
}

/**
 * Three card modes on the same words: Learn (中 → English, where I meet a word), Recall (English → 中, from memory)
 * and Listen (hear it → its meaning: ears, not eyes). Recall and Listen follow Learn: only words passed there.
 */
export type CardMode = 'learn' | 'recall' | 'listen'

export const STATE_KEY: Record<CardMode, string> = { learn: 'cardStates', recall: 'recallStates', listen: 'listenStates' }

/** Learn keeps the states saved before Recall existed. */
export const cardStates = (mode: CardMode = 'learn') => load<Record<string, CardState>>(STATE_KEY[mode], {})

/**
 * Recall's first version guessed "done in Learn" from old card history, which mixed in cards done English-first.
 * Start Recall afresh once: only words I pass in Learn from now on unlock it.
 */
function migrate(): void {
  if (load('cardsVersion', 1) >= 2) return
  save('learnOrder', [])
  save('recallStates', {})
  save('cardSession-recall', null)
  save('cardsVersion', 2)
}

/** The words I've passed in Learn (Hard or better), in the order I first passed them: how far Recall may go. */
export function learnOrder(): string[] {
  migrate()
  return load<string[]>('learnOrder', [])
}

/** Days I rated cards, for the streak (before this was kept: the days of each card's latest rating). */
export function cardDays(): string[] {
  const kept = load<string[] | null>('cardDays', null)
  if (kept) return kept
  const lasts = (['learn', 'recall', 'listen'] as const).flatMap((m) => Object.values(cardStates(m))).map((s) => s.last)
  return [...new Set(lasts.filter((t): t is number => typeof t === 'number' && t > 0).map(dayKey))]
}

/** Rate a card, Anki style. Passing it in Learn (Hard or better) unlocks it in Recall and Listen. */
export function rateCardIn(mode: CardMode, hanzi: string, rating: Rating, score: number | null = null): void {
  migrate()
  const states = cardStates(mode)
  const now = Date.now()
  logReview({ t: now, m: mode, h: hanzi, r: rating, before: snapshot(states[hanzi]) })
  states[hanzi] = schedule(states[hanzi], rating, now, score, timing())
  save(STATE_KEY[mode], states)
  const order = learnOrder()
  if (mode === 'learn' && rating >= 2 && !order.includes(hanzi)) save('learnOrder', [...order, hanzi])
  const today = dayKey(Date.now())
  const days = cardDays()
  if (!days.includes(today)) save('cardDays', [...days, today].slice(-400))
  sendProgress(STATE_KEY[mode], states)
  if (mode === 'learn') sendProgress('learnOrder', learnOrder())
}

// ---- My review log and the schedule fitted to it (cards/fit.ts) ----

const LOG_CAP = 30_000
export const reviewLog = () => load<Review[]>('reviewLog', [])

function logReview(r: Review): void {
  const log = reviewLog()
  log.push(r)
  save('reviewLog', log.slice(-LOG_CAP))
}

const snapshot = (s: CardState | undefined): Review['before'] =>
  s && { seen: s.seen, stability: s.stability, difficulty: s.difficulty, last: s.last, due: s.due }

export const scheduleFit = () => load<Fit | null>('scheduleFit', null)
export const personalScheduleOn = () => load('scheduleFitOn', true)
export const setPersonalScheduleOn = (on: boolean) => save('scheduleFitOn', on)
/** The parameters cards are scheduled with: fitted to me once that predicts better, else FSRS's defaults. */
export const scheduleParams = () => paramsFrom(scheduleFit(), personalScheduleOn())

/** Fit the schedule to my log (again once a week, as reviews add up). Returns the fit, or null if not enough yet. */
export function refitSchedule(force = false): Fit | null {
  const old = scheduleFit()
  if (!force && old && Date.now() - old.fittedAt < 7 * 86_400_000) return old
  const fit = fitParams(reviewLog())
  if (fit) save('scheduleFit', fit)
  return fit ?? old
}

/** How cards come back: standard, my multipliers, or my fixed times (Settings → Flashcards, or the Cards screen). */
export function timingMode(): TimingMode {
  // Before the modes existed, multipliers other than 1× meant I'd adjusted the schedule.
  const s = intervalScale()
  return load<TimingMode>('cardTiming', s.hard !== 1 || s.good !== 1 || s.easy !== 1 ? 'adjusted' : 'standard')
}
export const setTimingMode = (m: TimingMode) => save('cardTiming', m)
export const fixedTimes = () => ({ ...DEFAULT_FIXED, ...load<Partial<FixedTimes>>('cardFixedTimes', {}) })
export const setFixedTimes = (t: FixedTimes) => save('cardFixedTimes', t)
/** Everything a rating needs to work out when the card comes back. */
export const timing = (): Timing => ({ mode: timingMode(), scale: intervalScale(), fixed: fixedTimes(), params: scheduleParams() })

/** My interval multipliers for Hard / Good / Easy (Settings → Flashcards). */
export const intervalScale = () => ({ ...DEFAULT_SCALE, ...load<Partial<IntervalScale>>('cardIntervals', {}) })
export const setIntervalScale = (scale: IntervalScale) => save('cardIntervals', scale)

/** Rating buttons in colour (red / amber / green / blue) or plain. */
export type ButtonColours = 'colour' | 'plain'
export const buttonColours = () => load<ButtonColours>('cardColours', 'colour')
export const setButtonColours = (c: ButtonColours) => save('cardColours', c)

/** A new session for a mode: due reviews first, then new words (Recall's only as far as Learn has got). */
export function newSession(mode: CardMode, newPerSession = 0): Card[] {
  return mode === 'learn'
    ? // Learn: reviews that are due, then today's new words (all of them, in order).
      pickSession(allCards(), cardStates('learn'), { size: 40 + todaysNewCards().length + newPerSession, fresh: todaysNewCards() })
    : // Recall and Listen keep up with Learn: every word newly passed there comes up here (after any due reviews).
      pickRecallSession(allCards(), cardStates(mode), learnOrder(), { size: 40, newPerSession: 30 })
}

/** Reviews due now in each mode, plus (Recall, Listen) words Learn has unlocked that the mode hasn't met yet. */
export function dueCounts(): Record<CardMode, number> {
  const cards = allCards()
  const order = learnOrder()
  const following = (mode: CardMode) => pickRecallSession(cards, cardStates(mode), order, { size: 9999, newPerSession: 9999 }).length
  return {
    learn: pickSession(cards, cardStates('learn'), { size: 9999, fresh: todaysNewCards() }).length,
    recall: following('recall'),
    listen: following('listen'),
  }
}

/** Where I got to in each mode: restored when I come back (the same day) or switch modes. */
/** `pending`: cards rated this session that come back within a few hours (fixed times, or learning steps). */
export type SavedSession = { day: string; hanzi: string[]; index: number; scores: number[]; pending?: string[] }
export type Run = { cards: Card[]; index: number; scores: number[]; pending: string[] }
const today = () => new Date().toDateString()

export function resumeSession(mode: CardMode): Run {
  migrate()
  const saved = load<SavedSession | null>(`cardSession-${mode}`, null)
  const byHanzi = new Map(allCards().map((c) => [c.hanzi, c]))
  const cards = saved?.day === today() ? saved.hanzi.flatMap((h) => byHanzi.get(h) ?? []) : []
  const pending = saved?.pending ?? []
  if (saved && cards.length === saved.hanzi.length && (saved.index < cards.length || pending.length > 0))
    return { cards, index: saved.index, scores: saved.scores, pending }
  return { cards: newSession(mode), index: 0, scores: [], pending: [] }
}

export function keepSession(mode: CardMode, run: Run): void {
  save(`cardSession-${mode}`, { day: today(), hanzi: run.cards.map((c) => c.hanzi), index: run.index, scores: run.scores, pending: run.pending } satisfies SavedSession)
}

/** How soon a card must come back to wait in this session (later than this, it's a normal review another day). */
export const COMES_BACK_IN_SESSION = 4 * 60 * 60 * 1000

/**
 * Move cards from `pending` into the session once they're due again, right after the current card. Pure apart from
 * reading the card states, so a waiting card shows up as soon as its time comes.
 */
export function bringBackDue(run: Run, mode: CardMode, now = Date.now(), all = false): Run {
  if (run.pending.length === 0) return run
  const states = cardStates(mode)
  const ready = run.pending.filter((h) => all || (states[h]?.due ?? 0) <= now)
  if (ready.length === 0) return run
  const byHanzi = new Map(run.cards.map((c) => [c.hanzi, c]))
  const back = ready.flatMap((h) => byHanzi.get(h) ?? [])
  return {
    ...run,
    cards: [...run.cards.slice(0, run.index), ...back, ...run.cards.slice(run.index)],
    pending: run.pending.filter((h) => !ready.includes(h)),
  }
}
