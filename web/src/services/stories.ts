// Story generation + saved library. Stories live on this device, and in Firebase when signed in.

import storyPrompt from '../prompts/story.md?raw'
import { buildParagraph, knownRatio, type Lexicon, type Token } from '../chinese/tokens.ts'
import { callJson } from './claude.ts'
import { saveStory, type Story, type StoryLength, type Topic } from './library.ts'
import { getLexicon, knownWords, targetWords } from './words.ts'

export const LENGTHS: Record<StoryLength, { label: string; chars: string }> = {
  short: { label: 'Short', chars: '80–120' },
  medium: { label: 'Medium', chars: '200–300' },
  long: { label: 'Long', chars: '400–600' },
}

export const LEVEL_RULES: Record<number, string> = {
  1: 'HSK 1 grammar only, sentences under 10 characters, at most 3 new words.',
  2: 'HSK 1–2 grammar, sentences under 14 characters, at most 4 new words.',
  3: 'HSK 3 grammar, sentences under 18 characters, at most 5 new words.',
  4: 'HSK 4 grammar, sentences under 22 characters, at most 6 new words.',
  5: 'HSK 5 grammar, sentences under 28 characters, at most 7 new words.',
  6: 'HSK 6 grammar, natural sentence length, at most 8 new words.',
}

type StoryJson = {
  title_zh: string
  title_en: string
  paragraphs: string[][]
  new_words: string[]
  names: string[]
  glossary: { word: string; english: string }[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title_zh', 'title_en', 'paragraphs', 'new_words', 'names', 'glossary'],
  properties: {
    title_zh: { type: 'string' },
    title_en: { type: 'string' },
    paragraphs: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    new_words: { type: 'array', items: { type: 'string' } },
    names: { type: 'array', items: { type: 'string' } },
    glossary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'english'],
        properties: { word: { type: 'string' }, english: { type: 'string' } },
      },
    },
  },
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

function isStoryJson(v: unknown): v is StoryJson {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    typeof s.title_zh === 'string' &&
    typeof s.title_en === 'string' &&
    Array.isArray(s.paragraphs) &&
    s.paragraphs.length > 0 &&
    s.paragraphs.every((p) => isStrings(p) && p.length > 0) &&
    isStrings(s.new_words) &&
    isStrings(s.names) &&
    Array.isArray(s.glossary) &&
    s.glossary.every((g) => g && typeof g === 'object' && typeof g.word === 'string' && typeof g.english === 'string')
  )
}

/** Reader tokens for a story (rebuilt each time from the text + my current Anki words). */
export function storyTokens(story: Story, lexicon: Lexicon = getLexicon()): Token[][] {
  const names = new Set(story.names)
  const glossary = new Map(Object.entries(story.glossary))
  return story.paragraphs.map((p) => buildParagraph(p, lexicon, names, glossary))
}

export async function generateStory(level: number, topic: Topic, length: StoryLength): Promise<Story> {
  const lexicon = getLexicon()
  const known = knownWords(lexicon)
  const targets = targetWords(lexicon)
  const hasWords = known.length > 0

  const system = storyPrompt
    .replace('{{LEVEL}}', () => String(level))
    .replace('{{LEVEL_RULE}}', () => LEVEL_RULES[level])
    .replace('{{VOCAB_RULE}}', () =>
      hasWords
        ? 'At least 95% of the words must come from the learner\'s word list below (names and numbers don\'t count). Only step outside it for the target words or when there is truly no alternative.'
        : 'The learner\'s word list isn\'t available yet: stay within HSK vocabulary for this level.',
    )
    // Replacer functions, so nothing in the word list is read as a `$` replacement pattern.
    .replace('{{WORD_LIST}}', () =>
      hasWords
        ? `Learner's word list (words they know):\n${known.join(' ')}\n\nTarget words to practise (use up to 8, naturally):\n${targets.join(' ') || '(none)'}`
        : '',
    )
  const ask = (extra = '') =>
    callJson({
      system,
      prompt: `Write a ${LENGTHS[length].label.toLowerCase()} story (${LENGTHS[length].chars} characters) about ${topic}.${extra}`,
      schema: SCHEMA,
      guard: isStoryJson,
    })

  let json = await ask()
  let ratio = hasWords ? knownRatio(tokensOf(json, lexicon)).ratio : null
  if (ratio !== null && ratio < 0.9) {
    // Regenerate once, telling Claude which words were outside the list; keep whichever is better.
    const unknown = unknownWords(json, lexicon)
    const retry = await ask(` Your last draft used too many words outside the list (${unknown.join('、')}). Replace them with words from the list.`)
    const retryRatio = knownRatio(tokensOf(retry, lexicon)).ratio
    if (retryRatio > ratio) {
      json = retry
      ratio = retryRatio
    }
  }

  const story: Story = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    level,
    topic,
    length,
    titleZh: json.title_zh,
    titleEn: json.title_en,
    paragraphs: json.paragraphs,
    names: json.names,
    newWords: json.new_words,
    glossary: Object.fromEntries(json.glossary.map((g) => [g.word, g.english])),
    knownRatio: ratio,
    readAt: null,
    readSeconds: 0,
  }
  await saveStory(story)
  return story
}

function tokensOf(json: StoryJson, lexicon: Lexicon): Token[] {
  const names = new Set(json.names)
  return json.paragraphs.flatMap((p) => buildParagraph(p, lexicon, names))
}

function unknownWords(json: StoryJson, lexicon: Lexicon): string[] {
  const words = tokensOf(json, lexicon).filter((t) => t.kind === 'word' && t.mastery !== 'young' && t.mastery !== 'mature')
  return [...new Set(words.map((t) => t.text))].slice(0, 20)
}


export { TOPICS, getStory, listStories, saveStory, syncStories } from './library.ts'
export type { Story, StoryLength, Topic } from './library.ts'
