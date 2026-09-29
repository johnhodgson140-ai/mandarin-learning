// My speaking deck: Anki words + a starter list + new words from stories and mission reports.
import { mergeCards, pickRecallSession, pickSession, rateCard, type Card, type CardState, type Rating } from '../cards/srs.ts'
import { STARTER_CARDS } from '../cards/starter.ts'
import type { Session } from '../missions/logic.ts'
import { currentUser, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'
import { listStories } from './library.ts'
import { deckWords, getLexicon } from './words.ts'

export function allCards(): Card[] {
  // Words from Anki / my deck, plus the deck's whole sentences (great for speaking practice).
  const anki: Card[] = [
    ...[...getLexicon()].map(([hanzi, e]) => ({ hanzi, english: e.english, source: 'anki' as const })),
    ...deckWords().map((w) => ({ hanzi: w.hanzi, english: w.english, source: 'anki' as const })),
  ]
  const stories: Card[] = listStories().flatMap((s) => s.newWords.map((w) => ({ hanzi: w, english: s.glossary[w] ?? '', source: 'story' as const })))
  const missions: Card[] = load<Session[]>('sessions', []).flatMap((s) => (s.report?.new_words ?? []).map((w) => ({ hanzi: w.word, english: w.english, source: 'mission' as const })))
  return mergeCards(anki, stories, missions, STARTER_CARDS)
}

/** Two card modes on the same words: Learn (中 → English, where I meet a word) and Recall (English → 中, from memory). */
export type CardMode = 'learn' | 'recall'

const STATE_KEY: Record<CardMode, string> = { learn: 'cardStates', recall: 'recallStates' }

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

/** Rate a card, Anki style. Passing it in Learn (Hard or better) unlocks it in Recall. */
export function rateCardIn(mode: CardMode, hanzi: string, rating: Rating, score: number | null = null): void {
  migrate()
  const states = cardStates(mode)
  states[hanzi] = rateCard(states[hanzi], rating, Date.now(), score)
  save(STATE_KEY[mode], states)
  const order = learnOrder()
  if (mode === 'learn' && rating >= 2 && !order.includes(hanzi)) save('learnOrder', [...order, hanzi])
  if (isConfigured && currentUser()) {
    void dbPut(STATE_KEY[mode], states).catch(() => {})
    if (mode === 'learn') void dbPut('learnOrder', learnOrder()).catch(() => {})
  }
}

/** A new session for a mode: due reviews first, then new words (Recall's only as far as Learn has got). */
export function newSession(mode: CardMode, newPerSession = 4): Card[] {
  return mode === 'learn'
    ? pickSession(allCards(), cardStates('learn'), { newPerSession })
    : // Recall keeps up with Learn: every word newly passed there comes up here (after any due reviews).
      pickRecallSession(allCards(), cardStates('recall'), learnOrder(), { size: 40, newPerSession: 30 })
}

/** Reviews due now in each mode, plus (for Recall) words Learn has unlocked but Recall hasn't met yet. */
export function dueCounts(): Record<CardMode, number> {
  const cards = allCards()
  const recall = cardStates('recall')
  return {
    learn: pickSession(cards, cardStates('learn'), { size: 9999, newPerSession: 0 }).length,
    recall: pickRecallSession(cards, recall, learnOrder(), { size: 9999, newPerSession: 9999 }).length,
  }
}

/** Where I got to in each mode: restored when I come back (the same day) or switch modes. */
export type SavedSession = { day: string; hanzi: string[]; index: number; scores: number[] }
const today = () => new Date().toDateString()

export function resumeSession(mode: CardMode): { cards: Card[]; index: number; scores: number[] } {
  migrate()
  const saved = load<SavedSession | null>(`cardSession-${mode}`, null)
  const byHanzi = new Map(allCards().map((c) => [c.hanzi, c]))
  const cards = saved?.day === today() ? saved.hanzi.flatMap((h) => byHanzi.get(h) ?? []) : []
  if (saved && cards.length === saved.hanzi.length && saved.index < cards.length) return { cards, index: saved.index, scores: saved.scores }
  return { cards: newSession(mode), index: 0, scores: [] }
}

export function keepSession(mode: CardMode, cards: Card[], index: number, scores: number[]): void {
  save(`cardSession-${mode}`, { day: today(), hanzi: cards.map((c) => c.hanzi), index, scores } satisfies SavedSession)
}
