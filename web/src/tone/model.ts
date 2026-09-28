// Rule-based tone model: my pitch contour, normalised to my own voice range, compared with the
// textbook shape of each tone (Chao tone letters). Implements the interface in docs/SPEC.md §6.

import type { Tone } from '../chinese/tones.ts'
import { HOP_MS, pitchTrack, semitones } from './pitch.ts'

export type SpeakerProfile = { minSemitone: number; maxSemitone: number }
export type TonePrediction = { tone: Tone; probs: number[]; confidence: number }

export const POINTS = 30
const MIN_RANGE = 6 // semitones: never assume a voice range narrower than this
const NEUTRAL_MAX_MS = 110 // a voiced stretch this short is most likely a neutral tone
const SHARPNESS = 0.18

/** Textbook shapes, 0 = bottom of my range, 1 = top (Chao: 55, 35, 214 / half-third 211, 51, short mid). */
const TEMPLATES: { tone: Tone; points: number[] }[] = [
  { tone: 1, points: [0.9, 0.9] },
  { tone: 2, points: [0.45, 0.5, 0.95] },
  { tone: 3, points: [0.3, 0.05, 0.6] },
  { tone: 3, points: [0.3, 0.08, 0.1] }, // half third tone, the usual form mid-sentence
  { tone: 4, points: [0.95, 0.1] },
  { tone: 5, points: [0.4, 0.3] },
]

export function templateContour(tone: Tone): number[] {
  return resample(TEMPLATES.find((t) => t.tone === tone)!.points, POINTS)
}

/** Voice range from a few calibration recordings: 5th–95th percentile of all voiced pitch. */
export function calibrate(samples: Float32Array[], sampleRate: number): SpeakerProfile {
  const all = samples.flatMap((s) => voicedSemitones(s, sampleRate)).sort((a, b) => a - b)
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

export function predict(audio: Float32Array, sampleRate: number, profile: SpeakerProfile): TonePrediction {
  const voiced = voicedSemitones(audio, sampleRate)
  const voicedMs = voiced.length * HOP_MS
  if (voiced.length < 4) return { tone: 5, probs: [0.1, 0.1, 0.1, 0.1, 0.6], confidence: 0.3 }

  const shape = normalise(resample(median3(voiced), POINTS), profile)
  const best: number[] = [Infinity, Infinity, Infinity, Infinity, Infinity]
  for (const t of TEMPLATES) {
    const tpl = resample(t.points, POINTS)
    const rms = Math.sqrt(shape.reduce((sum, v, i) => sum + (v - tpl[i]) ** 2, 0) / POINTS)
    best[t.tone - 1] = Math.min(best[t.tone - 1], rms)
  }
  // Neutral tones are short; full tones rarely are.
  if (voicedMs <= NEUTRAL_MAX_MS) best[4] *= 0.5
  else best[4] *= 1.6

  const weights = best.map((d) => Math.exp(-((d / SHARPNESS) ** 2)))
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const probs = weights.map((w) => w / total)
  const top = probs.indexOf(Math.max(...probs))
  return { tone: (top + 1) as Tone, probs, confidence: probs[top] }
}

function voicedSemitones(audio: Float32Array, sampleRate: number): number[] {
  const track = pitchTrack(audio, sampleRate)
  // Drop octave jumps: keep frames within an octave of the median.
  const hz = track.filter((f): f is number => f !== null)
  if (hz.length === 0) return []
  const median = [...hz].sort((a, b) => a - b)[Math.floor(hz.length / 2)]
  return hz.filter((f) => f > median / 1.8 && f < median * 1.8).map(semitones)
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
