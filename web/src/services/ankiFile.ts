// Phone-friendly Anki exchange (AnkiMobile has no API): import an export file, and export the words I added.

import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { isNativeApp } from '../native/app.ts'
import { countMastery, type MasteryCounts } from './anki-mapping.ts'
import type { SyncMeta } from './anki.ts'
import { currentUser, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'
import { saveWords } from './words.ts'

export type ImportResult = { total: number; counts: MasteryCounts; hasScheduling: boolean; noteType: string }

/** Read an AnkiMobile/Anki export (.apkg or .colpkg) and make it my word list. */
export async function importAnkiFile(file: File): Promise<ImportResult> {
  const [{ default: initSqlJs }, { readDeck }] = await Promise.all([import('sql.js'), import('../cards/apkg.ts')])
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const deck = readDeck(SQL, new Uint8Array(await file.arrayBuffer()))
  if (deck.words.length === 0) throw new Error('No Chinese words found in this export.')

  const words = deck.words.map(({ noteId, hanzi, pinyin, english, interval, mastery }) => ({ noteId, hanzi, pinyin, english, interval, mastery }))
  saveWords(words)
  save('deck', deck.words)
  save('deckImported', true) // don't replace it with the deck bundled with the app
  const meta: SyncMeta = { syncedAt: Date.now(), total: words.length, counts: countMastery(words) }
  save('meta', meta)
  if (isConfigured && currentUser()) {
    await dbPut('words', Object.fromEntries(words.map((w) => [String(w.noteId), w]))).catch(() => {})
    await dbPut('meta', meta).catch(() => {})
  }
  return { total: words.length, counts: meta.counts, hasScheduling: deck.hasScheduling, noteType: deck.noteType }
}

export type NewCard = { hanzi: string; pinyin: string; english: string; addedAt: number; exported: boolean }

export const newCards = () => load<NewCard[]>('newCards', [])

/** Remember a word I added in the app, for the next export to Anki. */
export function rememberNewCard(hanzi: string, pinyin: string, english: string): void {
  const list = newCards()
  if (list.some((c) => c.hanzi === hanzi)) return
  save('newCards', [...list, { hanzi, pinyin, english, addedAt: Date.now(), exported: false }])
}

/**
 * Save the words not exported yet as a text file for Anki, and mark them exported. The iPhone app can't download
 * files, so there it opens the share sheet ("Save to Files"); they're only marked exported once the file went somewhere.
 */
export async function exportNewCards(): Promise<number> {
  const { toAnkiText } = await import('../cards/apkg.ts')
  const list = newCards()
  const pending = list.filter((c) => !c.exported)
  if (pending.length === 0) return 0
  const name = `shuo-new-words-${new Date().toISOString().slice(0, 10)}.txt`
  const file = new File([toAnkiText(pending)], name, { type: 'text/plain;charset=utf-8' })
  if (isNativeApp()) {
    if (!navigator.canShare?.({ files: [file] })) throw new Error('This device can’t share files. Export from the website instead.')
    await navigator.share({ files: [file], title: name }) // throws if I cancel: nothing is marked
  } else {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  save('newCards', list.map((c) => ({ ...c, exported: true })))
  return pending.length
}
