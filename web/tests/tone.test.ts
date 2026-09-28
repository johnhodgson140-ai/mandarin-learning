import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pitchTrack, semitones } from '../src/tone/pitch.ts'
import { calibrate, contour, predict, POINTS } from '../src/tone/model.ts'

const SR = 16000

/** A voice-like tone: pitch glides through the given Hz points; a few harmonics, like a real voice. */
function voice(hzPoints: number[], ms: number): Float32Array {
  const n = Math.round((ms / 1000) * SR)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (hzPoints.length - 1)
    const lo = Math.floor(x)
    const hi = Math.min(lo + 1, hzPoints.length - 1)
    const f = hzPoints[lo] + (hzPoints[hi] - hzPoints[lo]) * (x - lo)
    phase += (2 * Math.PI * f) / SR
    out[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase)
  }
  return out
}

test('pitchTrack finds f0 of a steady voice within 2%', () => {
  for (const hz of [95, 150, 220, 310]) {
    const track = pitchTrack(voice([hz], 300), SR).filter((f): f is number => f !== null)
    assert.ok(track.length > 15, `voiced frames at ${hz} Hz`)
    const mean = track.reduce((a, b) => a + b, 0) / track.length
    assert.ok(Math.abs(mean - hz) / hz < 0.02, `${hz} Hz tracked as ${mean.toFixed(1)}`)
  }
})

test('pitchTrack marks silence as unvoiced', () => {
  assert.ok(pitchTrack(new Float32Array(SR / 2), SR).every((f) => f === null))
})

// A male-ish voice: comfortable range roughly 100–200 Hz.
const profile = calibrate([voice([100, 200], 600), voice([200, 100], 600)], SR)

test('calibrate finds the voice range in semitones', () => {
  assert.ok(Math.abs(profile.minSemitone - semitones(100)) < 1.5, `min ${profile.minSemitone}`)
  assert.ok(Math.abs(profile.maxSemitone - semitones(200)) < 1.5, `max ${profile.maxSemitone}`)
  const narrow = calibrate([voice([150], 400)], SR)
  assert.ok(narrow.maxSemitone - narrow.minSemitone >= 6, 'never narrower than 6 semitones')
})

test('contour gives 30 points', () => {
  assert.equal(contour(voice([120, 180], 300), SR).length, POINTS)
  assert.deepEqual(contour(new Float32Array(3200), SR), [])
})

const cases: [number, number[], number][] = [
  [1, [188, 190, 189], 320], // high and level
  [2, [140, 146, 195], 320], // rising
  [3, [130, 104, 150], 380], // low dip then rise
  [3, [130, 106, 108], 260], // half third: low, no rise
  [4, [196, 108], 280], // high fall
  [5, [135, 128], 90], // short and mid: neutral
]

for (const [tone, hz, ms] of cases) {
  test(`predict: synthetic tone ${tone} (${hz.join('→')} Hz, ${ms} ms)`, () => {
    const p = predict(voice(hz, ms), SR, profile)
    assert.equal(p.tone, tone, `probs ${p.probs.map((x) => x.toFixed(2)).join(' ')}`)
    assert.ok(Math.abs(p.probs.reduce((a, b) => a + b, 0) - 1) < 1e-9)
  })
}

test('predict on silence falls back to an unsure neutral', () => {
  const p = predict(new Float32Array(3200), SR, profile)
  assert.equal(p.tone, 5)
  assert.ok(p.confidence < 0.7)
})

test('a creaky tone 3 (loud, but almost no clear pitch) is still tone 3, not neutral', () => {
  let s = 3
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
  const onset = voice([130, 110], 90) // a little clear pitch as the vowel starts…
  const creak = Float32Array.from({ length: SR * 0.25 }, () => rnd() * 0.3) // …then creak: loud, aperiodic
  const audio = new Float32Array(onset.length + creak.length)
  audio.set(onset)
  audio.set(creak, onset.length)
  assert.equal(predict(audio, SR, profile).tone, 3)
})

test('tones survive speaking higher or lower than when calibrated', () => {
  const shift = (hz: number[], st: number) => hz.map((f) => f * 2 ** (st / 12))
  for (const st of [-2.5, 2.5]) {
    assert.equal(predict(voice(shift([188, 190, 189], st), 320), SR, profile).tone, 1, `tone 1 at ${st} st`)
    assert.equal(predict(voice(shift([140, 146, 195], st), 320), SR, profile).tone, 2, `tone 2 at ${st} st`)
    assert.equal(predict(voice(shift([196, 108], st), 280), SR, profile).tone, 4, `tone 4 at ${st} st`)
  }
})
