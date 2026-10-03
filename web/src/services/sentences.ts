// Example sentences on cards: the curated one from sentences.json (with English), else one from a story.
import type { Sentences } from '../chinese/sentences.ts'
import { listStories } from './library.ts'
import { packStories } from './pack.ts'
import { mineSentence } from './sentenceMining.ts'

export type Example = { zh: string; en: string | null }

/** The iOS app tries the website first (sentences added since the build), then its own copy. */
const SOURCES = import.meta.env.MODE === 'native' ? ['https://johnhodgson140-ai.github.io/mandarin-learning/', '/'] : [import.meta.env.BASE_URL]

let curated: Promise<Sentences> | null = null

function loadCurated(): Promise<Sentences> {
  curated ??= (async () => {
    for (const base of SOURCES) {
      try {
        const res = await fetch(`${base}sentences.json`)
        if (res.ok) return ((await res.json()) as { sentences: Sentences }).sentences
      } catch {
        // offline: try the next source
      }
    }
    curated = null
    return {}
  })()
  return curated
}

/** The curated example sentences for these words (those that have one), for shadowing. */
export async function sentencesFor(words: string[]): Promise<Example[]> {
  const all = await loadCurated()
  return words.flatMap((w) => (all[w] ? [{ zh: all[w][0], en: all[w][1] }] : []))
}

/** An example sentence for a word, or null if there's none anywhere. */
export async function exampleFor(hanzi: string): Promise<Example | null> {
  const mine = (await loadCurated())[hanzi]
  if (mine) return { zh: mine[0], en: mine[1] }
  const pack = await packStories().catch(() => [])
  const zh = mineSentence(hanzi, [...listStories(), ...pack].map((s) => s.paragraphs))
  return zh ? { zh, en: null } : null
}
