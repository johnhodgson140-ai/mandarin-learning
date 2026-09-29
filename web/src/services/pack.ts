// The ready-made pack: stories and guided missions for every level, written ahead of time by Claude
// (content/pack/, built by scripts/build-pack.ts into web/public/pack/). Works with no API key and offline.
import type { GuidedMission, PackStory } from '../daily/schema.ts'
import { getStory, saveStory, type Story, type Topic } from './library.ts'

/** The iOS app tries the website first (newer pack), then the copy it was built with. */
const BASES = import.meta.env.MODE === 'native' ? ['https://johnhodgson140-ai.github.io/mandarin-learning/', '/'] : [import.meta.env.BASE_URL]

let stories: Promise<PackStory[]> | null = null
let missions: Promise<GuidedMission[]> | null = null

async function fetchList<T>(file: string, key: string): Promise<T[]> {
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}pack/${file}`)
      if (res.ok) return ((await res.json()) as Record<string, T[]>)[key] ?? []
    } catch {
      // offline: try the next source
    }
  }
  throw new Error(`Couldn't load the ready-made ${key}.`)
}

export function packStories(): Promise<PackStory[]> {
  stories ??= fetchList<PackStory>('stories.json', 'stories').catch((err) => {
    stories = null
    throw err
  })
  return stories
}

export function packMissions(): Promise<GuidedMission[]> {
  missions ??= fetchList<GuidedMission>('missions.json', 'missions').catch((err) => {
    missions = null
    throw err
  })
  return missions
}

export async function packMission(id: string): Promise<GuidedMission | undefined> {
  return (await packMissions()).find((m) => m.id === id)
}

/** Put a pack story in my library (once), so the reader, progress and cards treat it like any other. */
export async function addPackStory(s: PackStory): Promise<string> {
  if (getStory(s.id)) return s.id
  const story: Story = {
    id: s.id,
    createdAt: Date.now(),
    level: s.level,
    topic: s.topic as Topic,
    length: s.length,
    titleZh: s.title_zh,
    titleEn: s.title_en,
    paragraphs: s.paragraphs,
    translations: s.translations,
    names: s.names,
    newWords: s.new_words,
    glossary: Object.fromEntries(s.glossary.map((g) => [g.word, g.english])),
    knownRatio: null,
    readAt: null,
    readSeconds: 0,
  }
  await saveStory(story)
  return s.id
}
