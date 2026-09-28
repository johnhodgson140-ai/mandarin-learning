import assert from 'node:assert/strict'
import { test } from 'node:test'
import { segmentSyllables } from '../src/tone/segment.ts'
import { calibrate, predict } from '../src/tone/model.ts'

const SR = 16000
let seed = 7
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

/**
 * A synthetic sentence: each syllable = a short noisy consonant burst, then a voiced vowel gliding through
 * its tone's pitch shape; optional pauses. Returns the audio and where each syllable really starts.
 */
function sentence(tones: number[][], { vowelMs = 190, consonantMs = 45, pauseAfter = new Set<number>() } = {}) {
  const parts: number[] = []
  const starts: number[] = []
  let phase = 0
  parts.push(...Array(Math.round(0.15 * SR)).fill(0).map(() => noise() * 0.002)) // leading silence
  tones.forEach((hz, i) => {
    starts.push(parts.length)
    for (let j = 0; j < (consonantMs / 1000) * SR; j++) parts.push(noise() * 0.06)
    const n = Math.round((vowelMs / 1000) * SR)
    for (let j = 0; j < n; j++) {
      const x = (j / (n - 1)) * (hz.length - 1)
      const lo = Math.floor(x)
      const hi = Math.min(lo + 1, hz.length - 1)
      const f = hz[lo] + (hz[hi] - hz[lo]) * (x - lo)
      phase += (2 * Math.PI * f) / SR
      const env = Math.min(1, j / 160, (n - j) / 160) // soft attack and release
      parts.push(env * (0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase)))
    }
    if (pauseAfter.has(i)) for (let j = 0; j < 0.25 * SR; j++) parts.push(noise() * 0.002)
  })
  parts.push(...Array(Math.round(0.15 * SR)).fill(0).map(() => noise() * 0.002))
  return { audio: Float32Array.from(parts), starts }
}

const T1 = [188, 190], T2 = [140, 195], T3 = [130, 104, 108], T4 = [196, 108]
const profile = calibrate([sentence([[100, 200]], { vowelMs: 600 }).audio, sentence([[200, 100]], { vowelMs: 600 }).audio], SR)

test('segmentSyllables finds each syllable to within ~60 ms', () => {
  const tones = [T3, T1, T4, T2, T3, T4, T1, T2]
  const { audio, starts } = sentence(tones, { pauseAfter: new Set([3]) })
  const spans = segmentSyllables(audio, SR, tones.length)
  assert.equal(spans.length, tones.length)
  spans.forEach((s, i) => {
    if (i === 0) return
    assert.ok(Math.abs(s.start - starts[i]) < 0.06 * SR, `syllable ${i}: found ${(s.start / SR).toFixed(3)} s, real ${(starts[i] / SR).toFixed(3)} s`)
  })
})

test('tones are recognised syllable by syllable in a whole sentence', () => {
  const expected = [3, 1, 4, 2, 4, 1, 2, 4, 1, 3]
  const shapes = { 1: T1, 2: T2, 3: T3, 4: T4 } as Record<number, number[]>
  const { audio } = sentence(expected.map((t) => shapes[t]), { pauseAfter: new Set([4]) })
  const spans = segmentSyllables(audio, SR, expected.length)
  const got = spans.map((s) => predict(audio.subarray(s.start, s.end), SR, profile).tone)
  const right = got.filter((t, i) => t === expected[i]).length
  assert.ok(right >= 9, `expected ${expected.join('')}, got ${got.join('')}`)
})

test('segmentSyllables copes with silence and impossible counts', () => {
  assert.equal(segmentSyllables(new Float32Array(SR), SR, 3).length, 3)
  const { audio } = sentence([T1])
  assert.equal(segmentSyllables(audio, SR, 40).length, 40) // more syllables than the audio can hold: equal slices
})
