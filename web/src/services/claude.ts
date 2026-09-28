// Claude, called straight from the browser with the key from Settings (this device only).
// Every call asks for JSON matching a schema, checks it with a type guard, and retries once via the fast model.

import Anthropic from '@anthropic-ai/sdk'
import { getKeys } from './keys.ts'

export const MODEL = 'claude-sonnet-5'
export const MODEL_FAST = 'claude-haiku-4-5-20251001'

type JsonCall<T> = {
  model?: string
  /** Stable text (cached): instructions + word list. */
  system: string
  /** One user message, or a whole conversation (user / assistant turns). */
  prompt: string | Anthropic.MessageParam[]
  schema: Record<string, unknown>
  guard: (value: unknown) => value is T
  maxTokens?: number
}

function client(): Anthropic {
  const apiKey = getKeys().claude
  if (!apiKey) throw new Error('Add your Claude API key in Settings first.')
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export async function callJson<T>({ model = MODEL, system, prompt, schema, guard, maxTokens = 16000 }: JsonCall<T>): Promise<T> {
  const anthropic = client()
  let text: string
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : prompt,
      output_config: { format: { type: 'json_schema', schema } },
    })
    if (response.stop_reason === 'refusal') throw new Error('Claude declined this request. Try a different topic.')
    text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
  } catch (err) {
    throw friendly(err)
  }

  const parsed = parse(text)
  if (guard(parsed)) return parsed

  // One validation retry with the fast model: repair the JSON to the schema.
  try {
    const repair = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: `Rewrite this so it is valid JSON matching the schema exactly. Keep the content.\n\nSchema:\n${JSON.stringify(schema)}\n\nText:\n${text}`,
        },
      ],
      output_config: { format: { type: 'json_schema', schema } },
    })
    const repaired = parse(repair.content.map((block) => (block.type === 'text' ? block.text : '')).join(''))
    if (guard(repaired)) return repaired
  } catch (err) {
    throw friendly(err)
  }
  throw new Error('Claude sent back something unexpected twice. Please try again.')
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function friendly(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error('Your Claude API key was rejected. Check it in Settings.')
  if (err instanceof Anthropic.PermissionDeniedError) return new Error("Your Claude API key can't use this model.")
  if (err instanceof Anthropic.RateLimitError) return new Error('Claude is busy (rate limit). Wait a minute and try again.')
  if (err instanceof Anthropic.APIConnectionError) return new Error("Couldn't reach Claude. Check your internet connection.")
  if (err instanceof Anthropic.APIError) return new Error(`Claude error ${err.status ?? ''}: ${err.message}`)
  return err instanceof Error ? err : new Error(String(err))
}
