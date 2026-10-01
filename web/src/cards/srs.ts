// "Say your cards": FSRS scheduling for speaking practice (Anki stays my main SRS).

export type CardSource = 'anki' | 'app' | 'story' | 'mission' | 'daily'
export type Card = { hanzi: string; english: string; source: CardSource }
/**
 * FSRS (the scheduler Anki uses by default): `stability` = days until my chance of recalling it falls to 90%,
 * `difficulty` 1–10. Older states from the box system (`box`) are converted on their next review.
 */
export type CardState = {
  due: number
  lastScore: number | null
  seen: number
  stability?: number
  difficulty?: number
  /** When it was last reviewed. */
  last?: number
  /** How I rated it last time (Again 1 … Easy 4). */
  lastRating?: Rating
  /** Box system (before FSRS). */
  box?: number
}

const DAY = 24 * 60 * 60 * 1000
/** Days per box in the old box system (only used to convert old states). */
export const BOX_DAYS = [0, 1, 2, 4, 8, 16]

// FSRS-5 default parameters (open-spaced-repetition), fitted on hundreds of millions of Anki reviews.
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]
const DECAY = -0.5
const FACTOR = 19 / 81
/** Aim to review when I'd still recall it 90% of the time. */
export const RETENTION = 0.9

export type Rating = 1 | 2 | 3 | 4 // again, hard, good, easy

/** My 1–100 speaking score as an FSRS rating. */
export const ratingFor = (score: number): Rating => (score < 60 ? 1 : score < 80 ? 2 : score < 95 ? 3 : 4)

/** Chance of recalling it `days` after the last review. */
export const retrievability = (days: number, stability: number) => (1 + (FACTOR * days) / stability) ** DECAY

const clampD = (d: number) => Math.min(10, Math.max(1, d))
const initialDifficulty = (g: Rating) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1)
const intervalDays = (stability: number) => Math.max(1, Math.round((stability / FACTOR) * (RETENTION ** (1 / DECAY) - 1)))

/** Update a card after I say it (score 1–100). "Again" puts it straight back into today's queue. */
export function nextState(state: CardState | undefined, score: number, now = Date.now()): CardState {
  return rateCard(state, ratingFor(score), now, score)
}

/** My own stretch or shrink of the interval each button gives (1 = FSRS as is), like Anki's interval modifiers. */
export type IntervalScale = { hard: number; good: number; easy: number }
export const DEFAULT_SCALE: IntervalScale = { hard: 1, good: 1, easy: 1 }

/** Update a card with my own rating, Anki style (the speaking score, if any, is kept for stats). */
export function rateCard(
  state: CardState | undefined,
  g: Rating,
  now = Date.now(),
  score: number | null = null,
  scale: IntervalScale = DEFAULT_SCALE,
): CardState {
  const seen = (state?.seen ?? 0) + 1
  let stability: number
  let difficulty: number
  if (!state || state.seen === 0) {
    stability = W[g - 1]
    difficulty = initialDifficulty(g)
  } else {
    // Convert a box-system state the first time.
    const s0 = state.stability ?? Math.max(0.5, BOX_DAYS[state.box ?? 1] ?? 1)
    const d0 = state.difficulty ?? 5
    const last = state.last ?? state.due - (BOX_DAYS[state.box ?? 1] ?? 1) * DAY
    const elapsed = Math.max(0, (now - last) / DAY)
    const r = retrievability(elapsed, s0)
    const delta = -W[6] * (g - 3)
    difficulty = clampD(W[7] * initialDifficulty(4) + (1 - W[7]) * (d0 + (delta * (10 - d0)) / 9))
    if (elapsed < 1) stability = s0 * Math.exp(W[17] * (g - 3 + W[18])) // reviewed again the same day
    else if (g === 1) stability = Math.min(s0, W[11] * d0 ** -W[12] * ((s0 + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r)))
    else
      stability =
        s0 *
        (Math.exp(W[8]) * (11 - d0) * s0 ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1)
  }
  stability = Math.max(0.1, stability)
  const factor = g === 2 ? scale.hard : g === 3 ? scale.good : scale.easy
  const due = g === 1 ? now : now + Math.max(1, Math.round(intervalDays(stability) * factor)) * DAY
  return { due, lastScore: score, lastRating: g, seen, stability, difficulty, last: now }
}

/** Days until a card comes back (for showing after a review). */
export const daysUntil = (state: CardState, now = Date.now()) => Math.max(0, Math.round((state.due - now) / DAY))

/** How likely I am to recall a card right now (0–1); box-system states are estimated from their box. */
function recallNow(state: CardState, now: number): number {
  const stability = state.stability ?? Math.max(0.5, BOX_DAYS[state.box ?? 1] ?? 1)
  const last = state.last ?? state.due - stability * DAY
  return retrievability(Math.max(0, (now - last) / DAY), stability)
}

/**
 * Today's session: due cards first (the ones I'm most likely to have forgotten first), then up to `newPerSession` unseen cards
 * (Anki words before app words), `size` cards in all.
 */
export function pickSession(
  cards: Card[],
  states: Record<string, CardState>,
  { size = 10, newPerSession = 4, now = Date.now(), fresh }: { size?: number; newPerSession?: number; now?: number; fresh?: Card[] } = {},
): Card[] {
  const due = cards
    .filter((c) => states[c.hanzi] && states[c.hanzi].due <= now)
    .sort((a, b) => recallNow(states[a.hanzi], now) - recallNow(states[b.hanzi], now) || states[a.hanzi].due - states[b.hanzi].due)
  const order: CardSource[] = ['anki', 'daily', 'story', 'mission', 'app']
  // New cards: the ones given (today's words), else the first unseen ones, by source.
  const newCards =
    fresh ??
    cards
      .filter((c) => !states[c.hanzi])
      .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
      .slice(0, newPerSession)
  return [...due.slice(0, size - newCards.length), ...newCards].slice(0, size)
}

/**
 * Recall (English → Chinese): Recall reviews that are due first, then words I've already done in Learn but not yet in
 * Recall, strictly in the order I first did them in Learn. A word Learn hasn't reached never appears.
 */
export function pickRecallSession(
  cards: Card[],
  recall: Record<string, CardState>,
  learnOrder: readonly string[],
  { size = 10, newPerSession = 4, now = Date.now() } = {},
): Card[] {
  const byHanzi = new Map(cards.map((c) => [c.hanzi, c]))
  const unlocked = learnOrder.flatMap((h) => byHanzi.get(h) ?? [])
  const due = unlocked
    .filter((c) => recall[c.hanzi] && recall[c.hanzi].due <= now)
    .sort((a, b) => recallNow(recall[a.hanzi], now) - recallNow(recall[b.hanzi], now) || recall[a.hanzi].due - recall[b.hanzi].due)
  const fresh = unlocked.filter((c) => !recall[c.hanzi]).slice(0, newPerSession)
  return [...due.slice(0, size - fresh.length), ...fresh].slice(0, size)
}

/** Shuffle the cards I haven't done yet in this session (Fisher–Yates); the ones already done stay put. */
export function shuffleRest<T>(cards: T[], from: number, random = Math.random): T[] {
  const rest = cards.slice(from)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [...cards.slice(0, from), ...rest]
}

/** Merge card sources, first one wins for duplicates. */
export function mergeCards(...lists: Card[][]): Card[] {
  const seen = new Map<string, Card>()
  for (const list of lists) for (const c of list) if (c.hanzi && !seen.has(c.hanzi)) seen.set(c.hanzi, c)
  return [...seen.values()]
}
