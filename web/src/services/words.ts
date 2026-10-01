// My words: the words I've met through Today's words (services/curriculum.ts), with how well I know each one from my
// Learn cards, plus Anki words I've practised here or synced (optional, from before the built-in list).

import type { Lexicon, LexiconEntry } from '../chinese/tokens.ts'
import type { Mastery, Word } from './anki-mapping.ts'
import { myWords } from './curriculum.ts'
import { currentUser, dbGet, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

let lexicon: Map<string, LexiconEntry> | null = null
let lexiconKey = ''

type CardStateLike = { stability?: number; lastRating?: number; lastScore?: number | null; box?: number }

/** How well I know a word, from its Learn card: not rated yet = new; just met or forgotten = learning; then young, mature (3 weeks+). */
export function masteryFrom(state: CardStateLike | undefined): Mastery {
  if (!state) return 'new'
  const stability = state.stability ?? state.box ?? 0
  if (state.lastRating === 1 || stability < 2) return 'learning'
  return stability < 21 ? 'young' : 'mature'
}

/** A note from my exported deck (web/public/deck.json, made by scripts/import_deck.py). */
export type DeckWord = Word & { example: string; section: string }

const isSentence = (hanzi: string) => /[，。？！,.?!…]/.test(hanzi)

/**
 * My words: the ones I've met through Today's words, then Anki words I've practised here (my deck) or synced from Anki.
 * Mastery comes from my Learn cards. Rebuilt whenever my cards or words change. Whole sentences stay out.
 */
export function getLexicon(): Lexicon {
  const key = `${rawLength('cardStates')}:${rawLength('myWords')}:${rawLength('words')}:${rawLength('deck')}`
  if (!lexicon || key !== lexiconKey) {
    lexiconKey = key
    lexicon = new Map()
    const states = load<Record<string, CardStateLike>>('cardStates', {})
    for (const w of Object.values(myWords())) lexicon.set(w.hanzi, { pinyin: w.pinyin, english: w.english, mastery: masteryFrom(states[w.hanzi]) })
    for (const w of deckWords()) {
      if (states[w.hanzi] && !isSentence(w.hanzi) && !lexicon.has(w.hanzi)) lexicon.set(w.hanzi, { pinyin: w.pinyin, english: w.english, mastery: masteryFrom(states[w.hanzi]) })
    }
    for (const w of load<Word[]>('words', [])) {
      if (!isSentence(w.hanzi) && !lexicon.has(w.hanzi)) lexicon.set(w.hanzi, { pinyin: w.pinyin, english: w.english, mastery: w.mastery })
    }
  }
  return lexicon
}

/** Size of a stored value: changes whenever it does (a cheap way to know the word table needs rebuilding). */
function rawLength(key: string): number {
  try {
    return localStorage.getItem(`shuo.${key}`)?.length ?? 0
  } catch {
    return 0
  }
}

export const deckWords = () => load<DeckWord[]>('deck', [])

/** Words I'm studying (my deck), for writing stories before Anki tells us which ones I know. */
export function studyWords(lexicon: Lexicon): string[] {
  return [...lexicon.keys()]
}

/** Fetch the exported deck that ships with the app (refreshes when I send a new export). */
export async function loadDeck(): Promise<void> {
  if (load<boolean>('deckImported', false)) return // I imported my own export: keep it
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
