// My speaking deck: Anki words + a starter list + new words from stories and mission reports.
import { mergeCards, nextState, type Card, type CardState } from '../cards/srs.ts'
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

export const cardStates = () => load<Record<string, CardState>>('cardStates', {})

export function recordCard(hanzi: string, score: number): void {
  const states = cardStates()
  states[hanzi] = nextState(states[hanzi], score)
  save('cardStates', states)
  if (isConfigured && currentUser()) void dbPut('cardStates', states).catch(() => {})
}
