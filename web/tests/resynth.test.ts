import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calibrate, predict, targetPitch } from '../src/tone/model.ts'
import { HOP_MS, pitchTrack } from '../src/tone/pitch.ts'
import { retune } from '../src/tone/resynth.ts'
import type { Tone } from '../src/chinese/tones.ts'

const SR = 16000

function voice(hzPoints: number[], ms: number): Float32Array {
  const n = Math.round((ms / 1000) * SR)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (hzPoints.length - 1)
    const lo = Math.floor(x)
    const hi = Math.min(lo + 1, hzPoints.length - 1)
    phase += (2 * Math.PI * (hzPoints[lo] + (hzPoints[hi] - hzPoints[lo]) * (x - lo))) / SR
    out[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase)
  }
  return out
}

const profile = calibrate([voice([100, 200], 600), voice([200, 100], 600)], SR)
const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length)

/** Target pitch for every voiced frame of `audio`, following `tone`. */
function targetFor(audio: Float32Array, tone: Tone): (number | null)[] {
  const track = pitchTrack(audio, SR)
  const voiced = track.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0)
  const [first, last] = [voiced[0], voiced[voiced.length - 1]]
  return track.map((f, i) => (f === null || i < first || i > last ? null : targetPitch(tone, (i - first) / (last - first), profile)))
}

test('retune turns a wrong tone into the right one, keeping length and loudness', () => {
  const said = voice([180, 182, 181], 350) // a flat, high tone 1…
  for (const tone of [2, 3, 4] as Tone[]) {
    const fixed = retune(said, SR, targetFor(said, tone)) // …re-pitched to the tone it should have been
    assert.equal(fixed.length, said.length)
    assert.equal(predict(fixed, SR, profile).tone, tone, `re-pitched to tone ${tone}`)
    assert.ok(Math.abs(rms(fixed) / rms(said) - 1) < 0.25, `loudness kept (${(rms(fixed) / rms(said)).toFixed(2)})`)
  }
})

test('retune with no target leaves the audio as it was', () => {
  const said = voice([140, 190], 300)
  const same = retune(said, SR, pitchTrack(said, SR).map(() => null))
  const diff = Math.sqrt(said.reduce((s, v, i) => s + (v - same[i]) ** 2, 0) / said.length)
  assert.ok(diff / rms(said) < 0.15, `close to the original (${(diff / rms(said)).toFixed(3)})`)
  assert.equal(predict(same, SR, profile).tone, predict(said, SR, profile).tone)
})

test('frames are 10 ms', () => assert.equal(HOP_MS, 10))
