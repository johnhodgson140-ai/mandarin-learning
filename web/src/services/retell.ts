// Optional Claude feedback on a retelling (the free coverage check works without it).
import retellPrompt from '../prompts/retell.md?raw'
import { callJson } from './claude.ts'

export type RetellFeedback = { content_score: number; summary_en: string; grammar_notes: string[]; better_version_zh: string }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['content_score', 'summary_en', 'grammar_notes', 'better_version_zh'],
  properties: {
    content_score: { type: 'integer' },
    summary_en: { type: 'string' },
    grammar_notes: { type: 'array', items: { type: 'string' } },
    better_version_zh: { type: 'string' },
  },
}

const isFeedback = (v: unknown): v is RetellFeedback => {
  const f = v as Partial<RetellFeedback> | null
  return !!f && typeof f.content_score === 'number' && typeof f.summary_en === 'string' && Array.isArray(f.grammar_notes) && typeof f.better_version_zh === 'string'
}

export function retellFeedback(story: string, retelling: string, level: number): Promise<RetellFeedback> {
  return callJson({
    system: retellPrompt.replace('{{LEVEL}}', () => String(level)),
    prompt: `Story:\n${story}\n\nLearner's retelling:\n${retelling}`,
    schema: SCHEMA,
    guard: isFeedback,
    maxTokens: 2000,
  })
}
