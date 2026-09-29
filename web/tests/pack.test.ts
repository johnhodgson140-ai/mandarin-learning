import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validatePack } from '../src/daily/schema.ts'

const read = (file: string) => JSON.parse(readFileSync(new URL(`../public/pack/${file}`, import.meta.url), 'utf8'))

// The ready-made pack (npm run pack builds it from content/pack/): if it's invalid, CI fails.
test('web/public/pack is valid', () => {
  const pack = { ...read('stories.json'), ...read('missions.json') }
  assert.deepEqual(validatePack(pack), [])
  assert.ok(pack.stories.length > 0 && pack.missions.length > 0)
})

test('every level has stories and guided missions', () => {
  const { stories } = read('stories.json')
  const { missions } = read('missions.json')
  for (let level = 1; level <= 6; level++) {
    assert.ok(stories.some((s: { level: number }) => s.level === level), `stories at level ${level}`)
    assert.ok(missions.some((m: { level: number }) => m.level === level), `missions at level ${level}`)
  }
})

test('validatePack catches a bad length', () => {
  const errors = validatePack({ stories: [{ id: 'a', level: 1, topic: 't', length: 'huge', title_zh: '题', title_en: 'T', paragraphs: [['我', '。']], translations: ['I.'], names: [], new_words: [], glossary: [] }], missions: [] })
  assert.deepEqual(errors, ['stories[0] (a).length must be short, medium or long'])
})
