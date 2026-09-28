// AnkiConnect client (desktop Anki on my Mac, http://127.0.0.1:8765) + sync into Firebase.
// Only works in a browser on the Mac with Anki open; everywhere else the app uses the last synced data.

import {
  cardsToWords,
  colourPinyin,
  countMastery,
  DECK,
  FROM_APP_DECK,
  NOTE_TYPE,
  type AnkiCard,
  type MasteryCounts,
} from './anki-mapping.ts'
import { dbDelete, dbGet, dbPush, dbPut } from './firebase.ts'
import { load, save } from './storage.ts'

const ANKI_URL = 'http://127.0.0.1:8765'
const CHUNK = 500

export type SyncMeta = { syncedAt: number; total: number; counts: MasteryCounts }
export type NewCard = { hanzi: string; pinyin: string[]; english: string }
type QueuedCard = NewCard & { queuedAt: number }

export class AnkiUnreachable extends Error {
  constructor() {
    super(
      "Couldn't reach Anki. Sync from Chrome on your Mac with Anki open, AnkiConnect installed, " +
        'and this site added to its webCorsOriginList (see README). If Chrome asked for permission, allow it and try again.',
    )
  }
}

async function anki<T>(action: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    // A plain-text body keeps this a "simple" CORS request (no preflight); AnkiConnect parses it as JSON anyway.
    res = await fetch(ANKI_URL, {
      method: 'POST',
      body: JSON.stringify({ action, version: 6, params }),
      signal: controller.signal,
    })
  } catch {
    throw new AnkiUnreachable()
  } finally {
    clearTimeout(timer)
  }
  const body = (await res.json().catch(() => null)) as { result: T; error: string | null } | null
  if (!body) throw new Error(`AnkiConnect sent an unexpected reply (HTTP ${res.status}).`)
  if (body.error) throw new Error(`Anki: ${body.error}`)
  return body.result
}

/** Pull every word/phrase note from my deck into Firebase, after sending any queued cards to Anki. */
export async function sync(onProgress: (message: string) => void = () => {}): Promise<{ meta: SyncMeta; sent: number }> {
  onProgress('Connecting to Anki…')
  // Generous timeout: the first time, Chrome may hold this request while it asks permission to reach local apps.
  // If Anki simply isn't running, the connection is refused immediately anyway.
  await anki('version', {}, 30_000)

  const sent = await flushQueue(onProgress)

  onProgress('Finding cards…')
  const ids = await anki<number[]>('findCards', { query: `"deck:${DECK}" "note:${NOTE_TYPE}"` }, 60_000)
  if (ids.length === 0) throw new Error(`Found no "${NOTE_TYPE}" cards in "${DECK}". Check both names in Anki.`)

  const cards: AnkiCard[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    onProgress(`Reading cards ${Math.min(i + CHUNK, ids.length)} / ${ids.length}…`)
    cards.push(...(await anki<AnkiCard[]>('cardsInfo', { cards: ids.slice(i, i + CHUNK) }, 60_000)))
  }

  const words = cardsToWords(cards)
  const meta: SyncMeta = { syncedAt: Date.now(), total: words.length, counts: countMastery(words) }
  onProgress(`Saving ${words.length} words…`)
  await dbPut('words', Object.fromEntries(words.map((w) => [String(w.noteId), w])))
  await dbPut('meta', meta)
  save('words', words)
  save('meta', meta)
  return { meta, sent }
}

/** Last sync info: from Firebase when online, else what this device saw last. */
export async function fetchMeta(): Promise<SyncMeta | null> {
  const meta = await dbGet<SyncMeta>('meta')
  save('meta', meta)
  return meta
}

export function cachedMeta(): SyncMeta | null {
  return load<SyncMeta | null>('meta', null)
}

export async function queuedCount(): Promise<number> {
  return Object.keys((await dbGet<Record<string, QueuedCard>>('ankiQueue')) ?? {}).length
}

/** Add a note to `…::05 From the App`; if Anki isn't reachable (e.g. on the phone), queue it for the next sync. */
export async function addCard(card: NewCard): Promise<'added' | 'duplicate' | 'queued'> {
  try {
    return await addToAnki(card)
  } catch (err) {
    if (!(err instanceof AnkiUnreachable)) throw err
    await dbPush('ankiQueue', { ...card, queuedAt: Date.now() } satisfies QueuedCard)
    return 'queued'
  }
}

export function addTestCard() {
  return addCard({ hanzi: '测试', pinyin: ['cè', 'shì'], english: 'test (added by Shuō; you can delete this)' })
}

async function addToAnki(card: NewCard): Promise<'added' | 'duplicate'> {
  await anki('createDeck', { deck: FROM_APP_DECK }, 30_000)
  try {
    await anki('addNote', {
      note: {
        deckName: FROM_APP_DECK,
        modelName: NOTE_TYPE,
        fields: {
          Hanzi: card.hanzi,
          Pinyin: colourPinyin(card.pinyin),
          English: card.english,
          Len: String([...card.hanzi].length),
        },
        tags: ['shuo'],
      },
    })
    return 'added'
  } catch (err) {
    if (err instanceof Error && /duplicate/i.test(err.message)) return 'duplicate'
    throw err
  }
}

async function flushQueue(onProgress: (message: string) => void): Promise<number> {
  const queue = (await dbGet<Record<string, QueuedCard>>('ankiQueue')) ?? {}
  const entries = Object.entries(queue)
  for (const [i, [id, card]] of entries.entries()) {
    onProgress(`Sending queued cards to Anki ${i + 1} / ${entries.length}…`)
    await addToAnki(card)
    await dbDelete(`ankiQueue/${id}`)
  }
  return entries.length
}
