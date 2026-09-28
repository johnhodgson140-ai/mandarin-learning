// My Anki word table, as last synced (this device's copy; refreshed from Firebase when signed in).

import type { Lexicon, LexiconEntry } from '../chinese/tokens.ts'
import type { Word } from './anki-mapping.ts'
import { currentUser, dbGet, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

let lexicon: Map<string, LexiconEntry> | null = null

export function getLexicon(): Lexicon {
  lexicon ??= new Map(load<Word[]>('words', []).map((w) => [w.hanzi, { pinyin: w.pinyin, english: w.english, mastery: w.mastery }]))
  return lexicon
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
