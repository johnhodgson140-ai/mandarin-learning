import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_FIXED, schedule, whenText, type Timing } from '../src/cards/timing.ts'
import { DEFAULT_SCALE, rateCard } from '../src/cards/srs.ts'

const t = (mode: Timing['mode'], scale = DEFAULT_SCALE): Timing => ({ mode, scale, fixed: DEFAULT_FIXED })
const MIN = 60_000

test('fixed times: Again 5 min, Hard 10 min, Good 30 min, Easy 1 day', () => {
  const now = 1_000_000
  assert.equal(schedule(undefined, 1, now, null, t('fixed')).due - now, 5 * MIN)
  assert.equal(schedule(undefined, 2, now, null, t('fixed')).due - now, 10 * MIN)
  assert.equal(schedule(undefined, 3, now, null, t('fixed')).due - now, 30 * MIN)
  assert.equal(schedule(undefined, 4, now, null, t('fixed')).due - now, 24 * 60 * MIN)
})

test('fixed times still track memory underneath (same stability as the standard schedule)', () => {
  const fixed = schedule(undefined, 3, 0, null, t('fixed'))
  assert.equal(fixed.stability, rateCard(undefined, 3, 0).stability)
})

test('multipliers only apply in their own mode', () => {
  const doubled = { hard: 2, good: 2, easy: 2 }
  const std = schedule(undefined, 3, 0, null, t('standard', doubled)).due
  const adj = schedule(undefined, 3, 0, null, t('adjusted', doubled)).due
  assert.equal(std, rateCard(undefined, 3, 0).due)
  assert.ok(adj > std)
})

test('button times read like Anki', () => {
  assert.equal(whenText(5 * MIN, 0), '5m')
  assert.equal(whenText(120 * MIN, 0), '2h')
  assert.equal(whenText(3 * 1440 * MIN, 0), '3d')
  assert.equal(whenText(0, 0), 'now')
})
