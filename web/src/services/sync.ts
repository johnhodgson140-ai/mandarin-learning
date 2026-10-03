// My progress on all my devices (Firebase, once it's set up and I'm signed in): on opening the app, merge what the
// other device saved with what's here, then save the result to both. Card states and words met are also sent as they
// change (services/cards.ts, services/curriculum.ts).
import { mergeLog, mergeMet, mergeOrder, mergeStates } from '../progress/merge.ts'
import { currentUser, dbGet, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

/** True once this device's progress has been merged with Firebase's: until then, sending would overwrite the other device's. */
let merged = false

/** Send one part of my progress to Firebase, once it's safe (see `merged`); before that, syncProgress sends it. */
export function sendProgress(key: string, value: unknown): void {
  if (merged && isConfigured && currentUser()) void dbPut(key, value).catch(() => {})
}

type Merge = (here: never, there: never) => unknown
/** Each part of my progress and how to merge this device's copy with Firebase's. */
const PARTS: Record<string, Merge> = {
  cardStates: mergeStates,
  recallStates: mergeStates,
  listenStates: mergeStates,
  myWords: mergeMet,
  learnOrder: mergeOrder,
  // Sent only here (once per opening), not on every rating: it grows to a few hundred kB.
  reviewLog: mergeLog,
}
const EMPTY: Record<string, unknown> = { learnOrder: [], reviewLog: [] }

export async function syncProgress(): Promise<void> {
  if (!isConfigured || !currentUser()) return
  const keys = Object.keys(PARTS)
  const remote = await Promise.all(keys.map((key) => dbGet<unknown>(key)))
  // Merge with what's here right now and save it straight away (no waiting in between, so nothing saved while
  // Firebase was answering is lost), then send the result back.
  const result = keys.map((key, i) => {
    const empty = EMPTY[key] ?? {}
    return [key, PARTS[key](load(key, empty) as never, (remote[i] ?? empty) as never)] as const
  })
  for (const [key, value] of result) save(key, value)
  merged = true
  await Promise.all(result.map(([key, value]) => dbPut(key, value)))
}
