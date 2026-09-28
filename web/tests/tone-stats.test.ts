import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Tone } from '../src/chinese/tones.ts'
import type { Status } from '../src/grading/grade.ts'
import { heatmap, pairStats, weakestPairs } from '../src/grading/toneStats.ts'

const s = (prevTone: Tone | null, spokenTone: Tone, status: Status) => ({ prevTone, spokenTone, status })

test('pair stats, heatmap and weakest pairs', () => {
  const stats = pairStats([
    s(null, 3, 'ok'),
    s(3, 4, 'wrong'), s(3, 4, 'wrong'), s(3, 4, 'ok'),
    s(2, 3, 'ok'), s(2, 3, 'ok'), s(2, 3, 'minor'),
    s(1, 1, 'ok'), s(1, 1, 'ok'), s(1, 1, 'ok'),
    s(4, 2, 'wrong'), // only one try: not enough to count
  ])
  const grid = heatmap(stats)
  assert.equal(grid[2][3], 1 / 3) // 3→4
  assert.equal(grid[1][2], 2 / 3) // 2→3
  assert.equal(grid[0][0], 1) // 1→1
  assert.equal(grid[4][4], null) // no data
  assert.deepEqual(weakestPairs(stats), [[3, 4], [2, 3], [1, 1]])
})
