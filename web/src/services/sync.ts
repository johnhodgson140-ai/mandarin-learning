// My progress on all my devices (Firebase, once it's set up and I'm signed in): on opening the app, merge what the
// other device saved with what's here, then save the result to both. Card states and words met are also sent as they
// change (services/cards.ts, services/curriculum.ts).
import { mergeMet, mergeOrder, mergeStates } from '../progress/merge.ts'
import { currentUser, dbGet, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

/** True once this device's progress has been merged with Firebase's: until then, sending would overwrite the other device's. */
let merged = false

/** Send one part of my progress to Firebase, once it's safe (see `merged`); before that, syncProgress sends it. */
export function sendProgress(key: string, value: unknown): void {
  if (merged && isConfigured && currentUser()) void dbPut(key, value).catch(() => {})
}

export async function syncProgress(): Promise<void> {
  if (!isConfigured || !currentUser()) return
  const [states, recall, met, order] = await Promise.all([
    dbGet<Record<string, { last?: number }>>('cardStates'),
    dbGet<Record<string, { last?: number }>>('recallStates'),
    dbGet<Record<string, { day: number }>>('myWords'),
    dbGet<string[]>('learnOrder'),
  ])
  // Merge with what's here right now and save it straight away (no waiting in between, so nothing saved while
  // Firebase was answering is lost), then send the result back.
  const result = {
    cardStates: mergeStates(load('cardStates', {}), states ?? {}),
    recallStates: mergeStates(load('recallStates', {}), recall ?? {}),
    myWords: mergeMet(load('myWords', {}), met ?? {}),
    learnOrder: mergeOrder(load<string[]>('learnOrder', []), order ?? []),
  }
  for (const [key, value] of Object.entries(result)) save(key, value)
  merged = true
  await Promise.all(Object.entries(result).map(([key, value]) => dbPut(key, value)))
}
