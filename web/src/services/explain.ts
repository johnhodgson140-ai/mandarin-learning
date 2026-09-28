// Optional deeper explanation of a pronunciation attempt (needs a Claude key; the free tips work without).
import type { Syllable } from '../chinese/tokens.ts'
import type { SyllableScore } from '../scoring/score.ts'
import { callJson, MODEL_FAST } from './claude.ts'

const SCHEMA = { type: 'object', additionalProperties: false, required: ['explanation'], properties: { explanation: { type: 'string' } } }

export async function explainAttempt(syllables: Syllable[], scores: SyllableScore[]): Promise<string> {
  const lines = syllables.map((s, i) => {
    const sc = scores[i]
    return `${s.hanzi} ${s.pinyin} (tone ${s.spoken}): score ${sc.score}; heard sounds "${sc.heardPinyin ?? '?'}"; tone model heard ${sc.heardTone ?? '?'}`
  })
  const result = await callJson({
    model: MODEL_FAST,
    maxTokens: 800,
    system:
      'You are a friendly Mandarin pronunciation coach for an English speaker. Given automatic scores for each syllable, explain in 2–4 short sentences what to fix first and exactly how (mouth, tongue, pitch). No pinyin tables, no lists longer than 3 items.',
    prompt: lines.join('\n'),
    schema: SCHEMA,
    guard: (v): v is { explanation: string } => !!v && typeof (v as { explanation?: unknown }).explanation === 'string',
  })
  return result.explanation
}
