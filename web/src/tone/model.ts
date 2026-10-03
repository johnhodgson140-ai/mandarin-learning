// Rule-based tone model: my pitch contour, normalised to my own voice range, compared with the
// textbook shape of each tone (Chao tone letters). Implements the interface in docs/SPEC.md §6.

import type { Tone } from '../chinese/tones.ts'
import { frameLoudness, HOP_MS, pitchTrack, semitones } from './pitch.ts'

export type SpeakerProfile = { minSemitone: number; maxSemitone: number }
export type TonePrediction = { tone: Tone; probs: number[]; confidence: number }

export const POINTS = 30
const MIN_RANGE = 6 // semitones: never assume a voice range narrower than this
const NEUTRAL_MAX_MS = 110 // a voiced stretch this short is most likely a neutral tone
const SHARPNESS = 0.18

/** Tuned with ml/tone-bench.ts (synthetic speech with real-world distortions): 76% → 97% average accuracy. */
export const TUNING = {
  /** How much of the difference in overall height counts, next to the difference in shape (1 = equally). */
  heightWeight: 0.3,
  /** Share of the start of the vowel to ignore. */
  trimStart: 0.15,
  /** How much less likely a full-length syllable is to be neutral. */
  neutralPenalty: 2.5,
  /** Longer than NEUTRAL_MAX_MS × this: can't be neutral. */
  neutralMaxFactor: 1.8,
  /** How strongly creak (loud, pitchless frames after the vowel starts) points to tone 3. */
  creakBoost: 1,
  /** Nearly no pitch found but this much sound: call it a creaky tone 3. */
  creakOnlyMs: 150,
  /** In sentences: how much to trust the range used in the recording over the calibrated one (0–1). */
  adaptWeight: 0.4,
}

/** Shape difference (both curves centred) combined with the difference in height. */
function distance(a: number[], b: number[]): number {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
  const ma = mean(a)
  const mb = mean(b)
  const shape = Math.sqrt(a.reduce((s, v, i) => s + (v - ma - (b[i] - mb)) ** 2, 0) / a.length)
  return Math.sqrt(shape ** 2 + (TUNING.heightWeight * (ma - mb)) ** 2)
}

/** Textbook shapes, 0 = bottom of my range, 1 = top (Chao: 55, 35, 214 / half-third 211, 51, short mid). */
const TEMPLATES: { tone: Tone; points: number[] }[] = [
  { tone: 1, points: [0.9, 0.9] },
  { tone: 2, points: [0.45, 0.5, 0.95] },
  { tone: 3, points: [0.3, 0.05, 0.6] },
  { tone: 3, points: [0.3, 0.08, 0.1] }, // half third tone, the usual form mid-sentence
  { tone: 4, points: [0.95, 0.1] },
  { tone: 5, points: [0.4, 0.3] },
]

export function templateContour(tone: Tone, { half = false } = {}): number[] {
  const forms = TEMPLATES.filter((t) => t.tone === tone)
  return resample((half && forms[1] ? forms[1] : forms[0]).points, POINTS)
}

/**
 * The pitch (Hz) a tone should have at `position` (0 = start of the vowel, 1 = end) in this voice range.
 * `half`: the low "half third" used mid-sentence, instead of the full dip-and-rise.
 */
export function targetPitch(tone: Tone, position: number, profile: SpeakerProfile, { half = false } = {}): number {
  const forms = TEMPLATES.filter((t) => t.tone === tone)
  const points = (half && forms[1] ? forms[1] : forms[0]).points
  const x = Math.min(1, Math.max(0, position)) * (points.length - 1)
  const lo = Math.floor(x)
  const hi = Math.min(lo + 1, points.length - 1)
  const v = points[lo] + (points[hi] - points[lo]) * (x - lo)
  const semitone = profile.minSemitone + v * (profile.maxSemitone - profile.minSemitone)
  return 100 * 2 ** (semitone / 12) // semitones are relative to 100 Hz (pitch.ts)
}

/** Voice range from a few calibration recordings: 5th–95th percentile of all voiced pitch. */
export function calibrate(samples: Float32Array[], sampleRate: number): SpeakerProfile {
  return profileFromPitches(samples.flatMap((s) => voicedSemitones(s, sampleRate)))
}

/** My voice range from pitch points (semitones): 5th–95th percentile, at least MIN_RANGE wide. */
export function profileFromPitches(pitches: number[]): SpeakerProfile {
  const all = [...pitches].sort((a, b) => a - b)
  if (all.length === 0) return { minSemitone: 0, maxSemitone: 12 }
  let min = all[Math.floor(all.length * 0.05)]
  let max = all[Math.floor(all.length * 0.95)]
  if (max - min < MIN_RANGE) {
    const mid = (min + max) / 2
    min = mid - MIN_RANGE / 2
    max = mid + MIN_RANGE / 2
  }
  return { minSemitone: min, maxSemitone: max }
}

/**
 * For a sentence: blend my calibrated range with the range I'm actually using in this recording (people speak
 * higher, lower or flatter than when they calibrated). Needs a few syllables' worth of pitch to be reliable.
 */
export function adaptProfile(profile: SpeakerProfile, audio: Float32Array, sampleRate: number, syllables: number): SpeakerProfile {
  const w = TUNING.adaptWeight
  if (syllables < 3 || w <= 0) return profile
  const pitches = voicedSemitones(audio, sampleRate)
  if (pitches.length < 30) return profile
  const now = profileFromPitches(pitches)
  return {
    minSemitone: (1 - w) * profile.minSemitone + w * now.minSemitone,
    maxSemitone: (1 - w) * profile.maxSemitone + w * now.maxSemitone,
  }
}

/** ~30 points of pitch in semitones over the voiced part of the audio (empty if nothing was voiced). */
export function contour(audio: Float32Array, sampleRate: number): number[] {
  const voiced = voicedSemitones(audio, sampleRate)
  return voiced.length < 2 ? voiced : resample(median3(voiced), POINTS)
}

/** Contour scaled into my voice range: 0 = my lowest, 1 = my highest. */
export function normalise(points: number[], profile: SpeakerProfile): number[] {
  const range = profile.maxSemitone - profile.minSemitone
  return points.map((p) => (p - profile.minSemitone) / range)
}

/**
 * `neutralByLength`: treat a very short syllable as probably neutral. Right for single words; off in sentences,
 * where syllables are short anyway and the expected neutral tones are known from the text.
 */
export function predict(audio: Float32Array, sampleRate: number, profile: SpeakerProfile, { neutralByLength = true } = {}): TonePrediction {
  const track = pitchTrack(audio, sampleRate)
  const voiced = voicedFromTrack(track)
  const voicedMs = voiced.length * HOP_MS
  // Creak: loud but pitchless frames once the vowel has started. Mandarin tone 3 often goes creaky at its low
  // point, where pitch tracking fails, so this is evidence for tone 3 rather than something to ignore.
  const loud = frameLoudness(audio, sampleRate)
  const firstVoiced = track.findIndex((f) => f !== null)
  let loudAfter = 0
  let creaky = 0
  if (firstVoiced >= 0)
    for (let i = firstVoiced; i < track.length; i++)
      if (loud[i]) {
        loudAfter++
        if (track[i] === null) creaky++
      }
  const creak = loudAfter ? creaky / loudAfter : 0
  if (voiced.length < 4) {
    const loudFrames = loud.filter(Boolean).length
    if (loudFrames * HOP_MS >= TUNING.creakOnlyMs) return { tone: 3, probs: [0.1, 0.1, 0.55, 0.1, 0.15], confidence: 0.55 }
    return { tone: 5, probs: [0.1, 0.1, 0.1, 0.1, 0.6], confidence: 0.3 }
  }

  // Skip the start of the vowel: the consonant and the previous syllable bend its first few tens of ms.
  const skip = Math.floor(voiced.length * TUNING.trimStart)
  const shape = normalise(resample(median3(voiced).slice(skip), POINTS), profile)
  const best: number[] = [Infinity, Infinity, Infinity, Infinity, Infinity]
  for (const t of TEMPLATES) {
    const tpl = resample(t.points, POINTS).slice(0)
    const tplTrimmed = resample(tpl.slice(Math.floor(tpl.length * TUNING.trimStart)), POINTS)
    best[t.tone - 1] = Math.min(best[t.tone - 1], distance(shape, tplTrimmed))
  }
  // Neutral tones are short; a full-length syllable is never neutral. In sentences the neutral syllables are
  // known from the text (and not tone-checked), so neutral isn't a candidate there at all.
  // Length = how long the vowel sounds, not just how much of it had a clear pitch (creak has none).
  const soundMs = Math.max(voicedMs, loudAfter * HOP_MS)
  if (!neutralByLength || soundMs > NEUTRAL_MAX_MS * TUNING.neutralMaxFactor) best[4] = Infinity
  else if (soundMs <= NEUTRAL_MAX_MS) best[4] *= 0.5
  else best[4] *= TUNING.neutralPenalty

  best[2] *= 1 - TUNING.creakBoost * Math.min(creak, 0.5)

  const weights = best.map((d) => Math.exp(-((d / SHARPNESS) ** 2)))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const probs = weights.map((w) => w / total)
  const top = probs.indexOf(Math.max(...probs))
  return { tone: (top + 1) as Tone, probs, confidence: probs[top] }
}

export function voicedSemitones(audio: Float32Array, sampleRate: number): number[] {
  return voicedFromTrack(pitchTrack(audio, sampleRate))
}

function voicedFromTrack(track: (number | null)[]): number[] {
  const hz = track.filter((f): f is number => f !== null)
  if (hz.length === 0) return []
  const median = [...hz].sort((a, b) => a - b)[Math.floor(hz.length / 2)]
  // Octave errors (creaky voice at the bottom of tone 3 reads as half the pitch; some frames double):
  // fold them back next to the median instead of dropping them, and drop what still doesn't fit.
  return hz
    .map((f) => (f < median / 1.6 ? f * 2 : f > median * 1.6 ? f / 2 : f))
    .filter((f) => f > median / 1.8 && f < median * 1.8)
    .map(semitones)
}

function median3(values: number[]): number[] {
  return values.map((v, i) => {
    const w = [values[i - 1] ?? v, v, values[i + 1] ?? v].sort((a, b) => a - b)
    return w[1]
  })
}

export function resample(values: number[], n: number): number[] {
  if (values.length === 1) return Array(n).fill(values[0])
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (values.length - 1)
    const lo = Math.floor(x)
    const hi = Math.min(lo + 1, values.length - 1)
    return values[lo] + (values[hi] - values[lo]) * (x - lo)
  })
}
