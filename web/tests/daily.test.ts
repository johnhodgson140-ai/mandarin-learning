import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validateDaily } from '../src/daily/schema.ts'

// The file the scheduled session writes: if it's invalid, CI fails and it never reaches the phone.
test('web/public/daily/latest.json is valid', () => {
  const daily = JSON.parse(readFileSync(new URL('../public/daily/latest.json', import.meta.url), 'utf8'))
  assert.deepEqual(validateDaily(daily), [])
})

test('validateDaily catches the usual mistakes', () => {
  const errors = validateDaily({
    date: '28/09/2026',
    level: 9,
    plan: { focus_en: 'x', items: [{ kind: 'story', title_en: 'Read', ref: 'missing' }] },
    stories: [{ id: 's', level: 1, topic: 't', title_zh: '题', title_en: 'T', paragraphs: [['我 们', '。']], names: [], new_words: [], glossary: [] }],
    missions: [{ id: 's', level: 1, title: 'T', role: 'r', goal: 'g', closing_zh: '好', closing_en: 'ok', steps: [] }],
  })
  assert.deepEqual(errors, [
    'date must be YYYY-MM-DD',
    'level must be 1–6',
    'stories[0].paragraphs[0] words must not contain spaces',
    'stories[0].translations needs one English line per paragraph',
    'missions[0].id missing or duplicate',
    'missions[0] needs 3–8 steps',
    'plan item "Read" refers to unknown id missing',
  ])
  // Today's file without its stories: the plan's story item points nowhere. (Read from the file, which changes daily.)
  const daily = JSON.parse(readFileSync(new URL('../public/daily/latest.json', import.meta.url), 'utf8'))
  const storyItem = daily.plan.items.find((i: { kind: string }) => i.kind === 'story')
  assert.deepEqual(validateDaily({ ...daily, stories: [] }), [
    'at least one story',
    ...(storyItem ? [`plan item "${storyItem.title_en}" refers to unknown id ${storyItem.ref}`] : []),
  ])
})
