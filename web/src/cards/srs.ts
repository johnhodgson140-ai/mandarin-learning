// "Say your cards": a small Leitner-style schedule for speaking practice (Anki stays my main SRS).

export type CardSource = 'anki' | 'app' | 'story' | 'mission'
export type Card = { hanzi: string; english: string; source: CardSource }
export type CardState = { box: number; due: number; lastScore: number | null; seen: number }

const DAY = 24 * 60 * 60 * 1000
/** Days until a card in box 1–5 comes back. */
export const BOX_DAYS = [0, 1, 2, 4, 8, 16]
export const MAX_BOX = 5

/** Said well (80+): up a box. Close (60–79): same box, tomorrow. Poor: back to box 1, due now. */
export function nextState(state: CardState | undefined, score: number, now = Date.now()): CardState {
  const box = state?.box ?? 0
  const next = score >= 80 ? Math.min(MAX_BOX, box + 1) : score >= 60 ? Math.max(1, box) : 1
  const due = score >= 60 ? now + BOX_DAYS[next] * DAY : now
  return { box: next, due, lastScore: score, seen: (state?.seen ?? 0) + 1 }
}

/**
 * Today's session: due cards first (lowest box first), then up to `newPerSession` unseen cards
 * (Anki words before app words), `size` cards in all.
 */
export function pickSession(
  cards: Card[],
  states: Record<string, CardState>,
  { size = 10, newPerSession = 4, now = Date.now() } = {},
): Card[] {
  const due = cards
    .filter((c) => states[c.hanzi] && states[c.hanzi].due <= now)
    .sort((a, b) => states[a.hanzi].box - states[b.hanzi].box || states[a.hanzi].due - states[b.hanzi].due)
  const order: CardSource[] = ['anki', 'story', 'mission', 'app']
  const fresh = cards
    .filter((c) => !states[c.hanzi])
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
    .slice(0, newPerSession)
  return [...due.slice(0, size - Math.min(newPerSession, fresh.length)), ...fresh].slice(0, size)
}

/** Merge card sources, first one wins for duplicates. */
export function mergeCards(...lists: Card[][]): Card[] {
  const seen = new Map<string, Card>()
  for (const list of lists) for (const c of list) if (c.hanzi && !seen.has(c.hanzi)) seen.set(c.hanzi, c)
  return [...seen.values()]
}
