// My progress on all my devices (Firebase, once it's set up and I'm signed in): on opening the app, merge what the
// other device saved with what's here, then save the result to both. Card states and words met are also sent as they
// change (services/cards.ts, services/curriculum.ts).
import { mergeMet, mergeOrder, mergeStates } from '../progress/merge.ts'
import { currentUser, dbGet, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

export async function syncProgress(): Promise<void> {
  if (!isConfigured || !currentUser()) return
  const [states, recall, met, order] = await Promise.all([
    dbGet<Record<string, { last?: number }>>('cardStates'),
    dbGet<Record<string, { last?: number }>>('recallStates'),
    dbGet<Record<string, { day: number }>>('myWords'),
    dbGet<string[]>('learnOrder'),
  ])
  const merged = {
    cardStates: mergeStates(load('cardStates', {}), states ?? {}),
    recallStates: mergeStates(load('recallStates', {}), recall ?? {}),
    myWords: mergeMet(load('myWords', {}), met ?? {}),
    learnOrder: mergeOrder(load<string[]>('learnOrder', []), order ?? []),
  }
  for (const [key, value] of Object.entries(merged)) {
    save(key, value)
    await dbPut(key, value)
  }
}
