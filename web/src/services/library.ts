// My story library: saved on the device, and in Firebase when signed in. Kept free of heavy imports
// (no Claude SDK, no dictionary) so the Today screen can use it.

import { currentUser, dbGet, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'

export const TOPICS = ['football', 'archive fashion', 'anime', 'travel', 'daily life', 'business & finance'] as const
export type Topic = (typeof TOPICS)[number]
export type StoryLength = 'short' | 'medium' | 'long'
export type Story = {
  id: string
  createdAt: number
  level: number
  topic: Topic
  length: StoryLength
  titleZh: string
  titleEn: string
  /** Each paragraph as Claude's word split. Pinyin is never stored: it's rebuilt from the text. */
  paragraphs: string[][]
  /** English for each paragraph (older stories may not have it). */
  translations?: string[]
  names: string[]
  newWords: string[]
  glossary: Record<string, string>
  /** Known-word share when generated; null if Anki wasn't synced yet. */
  knownRatio: number | null
  readAt: number | null
  readSeconds: number
}

export function listStories(): Story[] {
  return load<Story[]>('stories', []).sort((a, b) => b.createdAt - a.createdAt)
}

export function getStory(id: string): Story | undefined {
  return listStories().find((s) => s.id === id)
}

export async function saveStory(story: Story): Promise<void> {
  save('stories', [story, ...listStories().filter((s) => s.id !== story.id)])
  if (isConfigured && currentUser()) await dbPut(`stories/${story.id}`, story).catch(() => {})
}

/** Pull stories saved on my other device (Firebase), keeping the newer read progress of each. */
export async function syncStories(): Promise<Story[]> {
  if (!isConfigured || !currentUser()) return listStories()
  const remote = (await dbGet<Record<string, Story>>('stories').catch(() => null)) ?? {}
  const merged = new Map(listStories().map((s) => [s.id, s]))
  for (const raw of Object.values(remote)) {
    const s = normalize(raw)
    const local = merged.get(s.id)
    if (!local || s.readSeconds > local.readSeconds || (s.readAt && !local.readAt)) merged.set(s.id, s)
  }
  save('stories', [...merged.values()])
  return listStories()
}

/** Firebase drops empty arrays and objects: put them back so a synced story is always complete. */
function normalize(s: Story): Story {
  return {
    ...s,
    paragraphs: s.paragraphs ?? [],
    names: s.names ?? [],
    newWords: s.newWords ?? [],
    glossary: s.glossary ?? {},
    knownRatio: s.knownRatio ?? null,
    readAt: s.readAt ?? null,
    readSeconds: s.readSeconds ?? 0,
  }
}
