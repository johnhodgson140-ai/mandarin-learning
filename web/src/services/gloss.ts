// Short English meaning for a word that isn't in Anki or the story's glossary (cheap model).
import { callJson, MODEL_FAST } from './claude.ts'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['english'],
  properties: { english: { type: 'string' } },
}

export async function glossFor(word: string, sentence: string): Promise<string> {
  const result = await callJson({
    model: MODEL_FAST,
    maxTokens: 200,
    system: 'You are a Chinese–English learner dictionary. Give the meaning of the word as used in the sentence: a few words of English, no pinyin, no explanation.',
    prompt: `Word: ${word}\nSentence: ${sentence}`,
    schema: SCHEMA,
    guard: (v): v is { english: string } => !!v && typeof (v as { english?: unknown }).english === 'string',
  })
  return result.english.trim()
}
