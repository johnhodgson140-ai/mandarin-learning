// Tone model adapter (docs/SPEC.md §6): my speaker profile + tone guesses per syllable.
// Until I've calibrated, the voice range is learned from my recordings (after about 5 of them).

import { decodeTo16k, encodeWav, TARGET_RATE, wavSamples } from '../audio/wav.ts'
import type { Tone } from '../chinese/tones.ts'
import type { CharResult, ToneGuess } from '../grading/grade.ts'
import { comparePitch, ownRange, PER_SYLLABLE, resampleTo, textbookReference, type PitchComparison } from '../tone/compare.ts'
import { adaptProfile, calibrate, contour, normalise, predict, targetPitch, profileFromPitches, templateContour, voicedSemitones, type SpeakerProfile } from '../tone/model.ts'
import { retune } from '../tone/resynth.ts'
import { segmentSyllables, type Span } from '../tone/segment.ts'
import { HOP_MS, pitchTrack } from '../tone/pitch.ts'
import { currentUser, dbGet, dbPut, isConfigured } from './firebase.ts'
import { activeVoice, listVoices, MIN_POINTS, OWNER_ID, updateVoice } from './voices.ts'
import { nativeAudio } from './tts.ts'

export type { SpeakerProfile }

const POINTS_PER_RECORDING = 40
const MAX_POINTS = 1200 // about the last 30 recordings

/**
 * The active voice's calibrated profile, else one learned from its recordings (or null). Each person who
 * practises on this phone has their own voice (services/voices.ts).
 */
export function getProfile(): SpeakerProfile | null {
  const voice = activeVoice()
  if (voice.profile) return voice.profile
  return voice.pitches.length >= MIN_POINTS ? profileFromPitches(voice.pitches) : null
}

export const isCalibrated = () => activeVoice().profile !== null

/** Remember some pitch points from this recording (evenly spaced) to learn the active voice's range. */
const learnedFrom = new WeakSet<Blob>() // each recording counts once, even when it's scored several times

export async function learnVoice(wav: Blob): Promise<void> {
  const voice = activeVoice()
  if (voice.profile || learnedFrom.has(wav)) return
  learnedFrom.add(wav)
  const voiced = voicedSemitones(await wavSamples(wav), TARGET_RATE)
  if (voiced.length < 10) return
  const step = Math.max(1, voiced.length / POINTS_PER_RECORDING)
  const picked: number[] = []
  for (let i = 0; i < voiced.length; i += step) picked.push(Math.round(voiced[Math.floor(i)] * 10) / 10)
  updateVoice(voice.id, { pitches: [...voice.pitches, ...picked].slice(-MAX_POINTS) })
}

/** Calibrate the active voice. My own voice is also saved to Firebase (when signed in) for my other device. */
export async function saveProfile(samples: Float32Array[]): Promise<SpeakerProfile> {
  const profile = calibrate(samples, TARGET_RATE)
  const voice = activeVoice()
  updateVoice(voice.id, { profile })
  if (voice.id === OWNER_ID && isConfigured && currentUser()) await dbPut('speakerProfile', profile).catch(() => {})
  return profile
}

/** Use the profile calibrated on my other device if my voice here has none. */
export async function syncProfile(): Promise<void> {
  const me = listVoices().find((v) => v.id === OWNER_ID)
  if (!me || me.profile || !isConfigured || !currentUser()) return
  const remote = await dbGet<SpeakerProfile>('speakerProfile').catch(() => null)
  if (remote) updateVoice(OWNER_ID, { profile: remote })
}

/** `span`: where the syllable is in the recording (samples at 16 kHz). */
export type SyllableTone = { guess: ToneGuess; probs: number[]; contour: number[]; span: Span }

/** Cut each syllable out of the recording (Azure's timings) and ask the tone model what I said. */
export async function syllableTones(wav: Blob, chars: Pick<CharResult, 'offset' | 'duration'>[]): Promise<(SyllableTone | null)[] | null> {
  const profile = getProfile()
  if (!profile) return null
  const samples = await wavSamples(wav)
  const adapted = adaptProfile(profile, samples, TARGET_RATE, chars.length)
  return chars.map((c) => {
    if (c.offset === null || c.duration === null) return null
    const from = Math.max(0, Math.round(((c.offset - 20) / 1000) * TARGET_RATE))
    const to = Math.min(samples.length, Math.round(((c.offset + c.duration + 20) / 1000) * TARGET_RATE))
    const clip = samples.subarray(from, to)
    const p = predict(clip, TARGET_RATE, adapted, { neutralByLength: chars.length === 1 })
    return { guess: { tone: p.tone, confidence: p.confidence }, probs: p.probs, contour: normalise(contour(clip, TARGET_RATE), adapted), span: { start: from, end: to } }
  })
}

/**
 * Tone guesses without Azure timings: find the syllables in the recording on the device (loudness dips and
 * unvoiced consonants, knowing how many there should be), then run the tone model on each.
 */
export async function segmentTones(wav: Blob, syllables: number): Promise<(SyllableTone | null)[] | null> {
  const profile = getProfile()
  if (!profile) return null
  const samples = await wavSamples(wav)
  const adapted = adaptProfile(profile, samples, TARGET_RATE, syllables)
  return segmentSyllables(samples, TARGET_RATE, syllables).map((span) => {
    const clip = samples.subarray(span.start, span.end)
    if (clip.length === 0) return null
    const p = predict(clip, TARGET_RATE, adapted, { neutralByLength: syllables === 1 })
    return { guess: { tone: p.tone, confidence: p.confidence }, probs: p.probs, contour: normalise(contour(clip, TARGET_RATE), adapted), span }
  })
}

/**
 * My recording with each syllable re-pitched to the tone it should have (neutral tones left as they are), in my
 * own voice range. Null until my voice is known (calibrated or learned).
 */
export async function correctedRecording(wav: Blob, spans: (Span | null)[], spoken: Tone[]): Promise<Blob | null> {
  const profile = getProfile()
  if (!profile) return null
  const samples = await wavSamples(wav)
  const adapted = adaptProfile(profile, samples, TARGET_RATE, spoken.length)
  const hop = Math.round((HOP_MS / 1000) * TARGET_RATE)
  const track = pitchTrack(samples, TARGET_RATE)
  const target: (number | null)[] = track.map(() => null)
  spans.forEach((span, i) => {
    const tone = spoken[i]
    if (!span || tone === 5) return
    // The vowel: first to last voiced frame of the syllable.
    let first = -1
    let last = -1
    for (let f = Math.floor(span.start / hop); f < Math.min(track.length, Math.ceil(span.end / hop)); f++)
      if (track[f] !== null) {
        if (first < 0) first = f
        last = f
      }
    if (first < 0 || last <= first) return
    // Mid-sentence, a third tone before another tone is the low "half third".
    const half = tone === 3 && i < spoken.length - 1
    for (let f = first; f <= last; f++) target[f] = targetPitch(tone, (f - first) / (last - first), adapted, { half })
  })
  return encodeWav(retune(samples, TARGET_RATE, target))
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

/**
 * My whole phrase against the native voice (with an Azure key) or the textbook tone shapes: works before my voice is
 * calibrated, since each line is compared within its own range. Null when there's too little voice to compare.
 */
export async function comparePhrase(
  wav: Blob,
  syllables: { hanzi: string; spoken: Tone }[],
): Promise<(PitchComparison & { against: 'native' | 'textbook' }) | null> {
  const mine = voicedSemitones(await wavSamples(wav), TARGET_RATE)
  const text = syllables.map((s) => s.hanzi).join('')
  const native = await nativeAudio(text).catch(() => null)
  if (native) {
    const voiced = voicedSemitones(await decodeTo16k(native), TARGET_RATE)
    if (voiced.length >= 8) {
      const reference = resampleTo(ownRange(voiced), syllables.length * PER_SYLLABLE)
      const result = comparePitch(mine, reference, syllables)
      return result && { ...result, against: 'native' }
    }
  }
  const result = comparePitch(mine, textbookReference(syllables, (tone, half) => templateContour(tone, { half })), syllables)
  return result && { ...result, against: 'textbook' }
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
