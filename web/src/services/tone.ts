// Tone model adapter (docs/SPEC.md §6): my speaker profile + tone guesses per syllable.
// Until I've calibrated, there is no profile and grading falls back to Azure only.

import { decodeTo16k, TARGET_RATE, wavSamples } from '../audio/wav.ts'
import type { Tone } from '../chinese/tones.ts'
import type { CharResult, ToneGuess } from '../grading/grade.ts'
import { calibrate, contour, normalise, predict, type SpeakerProfile } from '../tone/model.ts'
import { currentUser, dbGet, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'
import { nativeAudio } from './tts.ts'

export type { SpeakerProfile }

export function getProfile(): SpeakerProfile | null {
  return load<SpeakerProfile | null>('speakerProfile', null)
}

export async function saveProfile(samples: Float32Array[]): Promise<SpeakerProfile> {
  const profile = calibrate(samples, TARGET_RATE)
  save('speakerProfile', profile)
  if (isConfigured && currentUser()) await dbPut('speakerProfile', profile).catch(() => {})
  return profile
}

/** Use the profile calibrated on my other device if this one has none. */
export async function syncProfile(): Promise<void> {
  if (getProfile() || !isConfigured || !currentUser()) return
  const remote = await dbGet<SpeakerProfile>('speakerProfile').catch(() => null)
  if (remote) save('speakerProfile', remote)
}

export type SyllableTone = { guess: ToneGuess; probs: number[]; contour: number[] }

/** Cut each syllable out of the recording (Azure's timings) and ask the tone model what I said. */
export async function syllableTones(wav: Blob, chars: Pick<CharResult, 'offset' | 'duration'>[]): Promise<(SyllableTone | null)[] | null> {
  const profile = getProfile()
  if (!profile) return null
  const samples = await wavSamples(wav)
  return chars.map((c) => {
    if (c.offset === null || c.duration === null) return null
    const from = Math.max(0, Math.round(((c.offset - 20) / 1000) * TARGET_RATE))
    const to = Math.min(samples.length, Math.round(((c.offset + c.duration + 20) / 1000) * TARGET_RATE))
    const clip = samples.subarray(from, to)
    const p = predict(clip, TARGET_RATE, profile)
    return { guess: { tone: p.tone, confidence: p.confidence }, probs: p.probs, contour: normalise(contour(clip, TARGET_RATE), profile) }
  })
}

/** Tone guesses for a recording without Azure timings: split the voiced part evenly between syllables. */
export async function evenSplitTones(wav: Blob, syllables: number): Promise<(SyllableTone | null)[] | null> {
  const profile = getProfile()
  if (!profile) return null
  const samples = await wavSamples(wav)
  const span = voicedSpan(samples)
  if (!span) return Array(syllables).fill(null)
  const size = (span[1] - span[0]) / syllables
  return Array.from({ length: syllables }, (_, i) => {
    const clip = samples.subarray(Math.round(span[0] + i * size), Math.round(span[0] + (i + 1) * size))
    const p = predict(clip, TARGET_RATE, profile)
    return { guess: { tone: p.tone, confidence: p.confidence }, probs: p.probs, contour: normalise(contour(clip, TARGET_RATE), profile) }
  })
}

/** Native speaker's contour for a word (Azure voice), scaled to its own range; null without an Azure key. */
export async function nativeContour(text: string): Promise<number[] | null> {
  const blob = await nativeAudio(text).catch(() => null)
  if (!blob) return null
  const samples = await decodeTo16k(blob)
  const points = contour(samples, TARGET_RATE)
  if (points.length === 0) return null
  return normalise(points, calibrate([samples], TARGET_RATE))
}

/** Seconds of actual speech in a recording (silence at the start and end ignored). */
export async function voicedSeconds(wav: Blob): Promise<number> {
  const span = voicedSpan(await wavSamples(wav))
  return span ? (span[1] - span[0]) / TARGET_RATE : 0
}

/** Seconds the Azure voice takes to say `text` at `rate`; null without an Azure key. */
export async function nativeSeconds(text: string, rate: number): Promise<number | null> {
  const blob = await nativeAudio(text, rate).catch(() => null)
  if (!blob) return null
  const span = voicedSpan(await decodeTo16k(blob))
  return span ? (span[1] - span[0]) / TARGET_RATE : null
}

export const toneLabel = (tone: Tone) => (tone === 5 ? 'neutral' : `tone ${tone}`)

function voicedSpan(samples: Float32Array): [number, number] | null {
  const frame = TARGET_RATE / 100
  let first = -1
  let last = -1
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let energy = 0
    for (let j = i; j < i + frame; j++) energy += samples[j] ** 2
    if (Math.sqrt(energy / frame) > 0.02) {
      if (first < 0) first = i
      last = i + frame
    }
  }
  return first < 0 ? null : [first, last]
}
