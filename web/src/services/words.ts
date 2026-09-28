// My Anki word table, as last synced (this device's copy; refreshed from Firebase when signed in).

import type { Lexicon, LexiconEntry } from '../chinese/tokens.ts'
import type { Word } from './anki-mapping.ts'
import { currentUser, dbGet, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

let lexicon: Map<string, LexiconEntry> | null = null

/** A note from my exported deck (web/public/deck.json, made by scripts/import_deck.py). */
export type DeckWord = Word & { example: string; section: string }

const isSentence = (hanzi: string) => /[，。？！,.?!…]/.test(hanzi)

/**
 * My words: the last Anki sync first, then my exported deck for anything the sync doesn't have
 * (so the app knows my deck before Anki sync is set up). Whole sentences stay out of the word list.
 */
export function getLexicon(): Lexicon {
  if (!lexicon) {
    lexicon = new Map()
    for (const w of [...load<Word[]>('words', []), ...deckWords()]) {
      if (!isSentence(w.hanzi) && !lexicon.has(w.hanzi)) lexicon.set(w.hanzi, { pinyin: w.pinyin, english: w.english, mastery: w.mastery })
    }
  }
  return lexicon
}

export const deckWords = () => load<DeckWord[]>('deck', [])

/** Words I'm studying (my deck), for writing stories before Anki tells us which ones I know. */
export function studyWords(lexicon: Lexicon): string[] {
  return [...lexicon.keys()]
}

/** Fetch the exported deck that ships with the app (refreshes when I send a new export). */
export async function loadDeck(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}deck.json`, { cache: 'no-cache' })
    const json = (await res.json()) as { words?: DeckWord[] }
    if (Array.isArray(json.words)) {
      save('deck', json.words)
      lexicon = null
    }
  } catch {
    // offline: keep the copy we have
  }
}

export function saveWords(words: Word[]): void {
  save('words', words)
  lexicon = null
}

/** Words I know (young + mature): what stories should be built from. */
export function knownWords(lexicon: Lexicon): string[] {
  return [...lexicon].filter(([, e]) => e.mastery === 'young' || e.mastery === 'mature').map(([hanzi]) => hanzi)
}

/** Words I'm currently learning in Anki: up to 8 to practise in a story. */
export function targetWords(lexicon: Lexicon): string[] {
  return [...lexicon].filter(([, e]) => e.mastery === 'learning').map(([hanzi]) => hanzi).slice(0, 8)
}

/** Refresh this device's copy from the last Anki sync (on any device). */
export async function refreshWords(): Promise<void> {
  if (!isConfigured || !currentUser()) return
  const remote = await dbGet<Record<string, Word>>('words')
  if (remote) saveWords(Object.values(remote))
}
