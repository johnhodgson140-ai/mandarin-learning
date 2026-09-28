// Today's content from the scheduled Claude session (web/public/daily/latest.json). Works with no API key.
import { isDaily, type DailyContent } from '../daily/schema.ts'
import { load, save } from './storage.ts'
import { listStories, saveStory, type Story, type Topic } from './library.ts'

export function cachedDaily(): DailyContent | null {
  return load<DailyContent | null>('daily', null)
}

/** Where today's content comes from: the website first; the iOS app also has the copy it was built with. */
const SOURCES =
  import.meta.env.MODE === 'native'
    ? ['https://johnhodgson140-ai.github.io/mandarin-learning/daily/latest.json', '/daily/latest.json']
    : [`${import.meta.env.BASE_URL}daily/latest.json`]

/** Fetch the latest file (falls back to the cached copy offline) and add its stories to my library. */
export async function loadDaily(): Promise<DailyContent | null> {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      const json: unknown = await res.json()
      if (!isDaily(json)) continue
      // Never replace newer cached content with the older bundled copy.
      const cached = cachedDaily()
      if (cached && cached.date > json.date) break
      save('daily', json)
      await importStories(json)
      return json
    } catch {
      // offline or not there: try the next source
    }
  }
  return cachedDaily()
}

async function importStories(daily: DailyContent): Promise<void> {
  const have = new Map(listStories().map((s) => [s.id, s]))
  for (const [i, s] of daily.stories.entries()) {
    const saved = have.get(s.id)
    if (saved) {
      // Saved before translations existed: add them, keep my reading progress.
      if (!saved.translations) await saveStory({ ...saved, translations: s.translations })
      continue
    }
    const story: Story = {
      id: s.id,
      createdAt: Date.parse(daily.date) + i,
      level: s.level,
      topic: s.topic as Topic,
      length: 'short',
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
  }
}

export function guidedMission(id: string) {
  return cachedDaily()?.missions.find((m) => m.id === id)
}
