// Find where each syllable is in a recording, knowing how many there should be — on the device, no network.
// Mandarin syllables are separated by dips in loudness and by unvoiced consonants, so we choose N-1 cut points
// that land on low, unvoiced frames while keeping syllables a plausible length (dynamic programming).

import { HOP_MS, pitchTrack } from './pitch.ts'

export type Span = { start: number; end: number } // in samples

const FRAME_MS = HOP_MS
const MIN_SYLLABLE_MS = 70

/** Loudness per 10 ms frame, 0 (quietest) – 1 (loudest), lightly smoothed. */
function energy(audio: Float32Array, sampleRate: number): number[] {
  const hop = Math.round((FRAME_MS / 1000) * sampleRate)
  const raw: number[] = []
  for (let i = 0; i + hop <= audio.length; i += hop) {
    let sum = 0
    for (let j = i; j < i + hop; j++) sum += audio[j] ** 2
    raw.push(10 * Math.log10(sum / hop + 1e-10))
  }
  const smooth = raw.map((_, i) => {
    let s = 0
    let n = 0
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) {
      s += raw[k]
      n++
    }
    return s / n
  })
  const max = Math.max(...smooth)
  const floor = max - 40 // 40 dB of range is plenty for speech
  return smooth.map((v) => Math.min(1, Math.max(0, (v - floor) / 40)))
}

/** Split the speech in `audio` into `count` syllable spans (sample offsets). */
export function segmentSyllables(audio: Float32Array, sampleRate: number, count: number): Span[] {
  const hop = Math.round((FRAME_MS / 1000) * sampleRate)
  const e = energy(audio, sampleRate)
  if (count <= 0 || e.length === 0) return []

  // The speech region: from the first to the last clearly loud frame.
  let first = e.findIndex((v) => v > 0.45)
  let last = e.length - 1 - [...e].reverse().findIndex((v) => v > 0.45)
  if (first < 0) return Array.from({ length: count }, () => ({ start: 0, end: 0 }))
  first = Math.max(0, first - 2)
  last = Math.min(e.length - 1, last + 2)
  const frames = last - first + 1
  if (count === 1) return [{ start: first * hop, end: (last + 1) * hop }]

  // Voicing per frame (pitch tracker frames are the same 10 ms hops).
  const f0 = pitchTrack(audio, sampleRate)
  const voiced = (t: number) => f0[t] !== null && f0[t] !== undefined

  // Cost of cutting before frame t: loud and voiced = bad place for a boundary; just before a rise = good.
  const cutCost = (t: number) => e[t] + (voiced(t) ? 0.35 : 0) - 0.15 * (e[t + 2] ?? 0)

  // Syllable length counts only frames with sound, so pauses between phrases don't distort it.
  const active = new Int32Array(frames + 1)
  for (let t = 0; t < frames; t++) active[t + 1] = active[t] + (e[first + t] > 0.3 ? 1 : 0)
  const mean = Math.max(1, active[frames] / count)
  const frameMean = frames / count
  const minLen = Math.max(2, Math.min(Math.round(MIN_SYLLABLE_MS / FRAME_MS), Math.floor(frameMean * 0.5)))
  const maxLen = Math.max(minLen + 1, Math.ceil(frameMean * 4))
  const lengthCost = (s: number, t: number) => 0.6 * ((active[t] - active[s] - mean) / mean) ** 2

  // best[k][t]: cheapest way to end syllable k (0-based) just before local frame t.
  const INF = Number.POSITIVE_INFINITY
  const best = Array.from({ length: count + 1 }, () => new Float64Array(frames + 1).fill(INF))
  const from = Array.from({ length: count + 1 }, () => new Int32Array(frames + 1).fill(-1))
  best[0][0] = 0
  for (let k = 1; k <= count; k++) {
    for (let t = k * minLen; t <= frames; t++) {
      const lo = Math.max((k - 1) * minLen, t - maxLen)
      const cut = k === count ? 0 : cutCost(first + t)
      if (k === count && t !== frames) continue
      for (let s = lo; s <= t - minLen; s++) {
        const prev = best[k - 1][s]
        if (prev === INF) continue
        const c = prev + cut + lengthCost(s, t)
        if (c < best[k][t]) {
          best[k][t] = c
          from[k][t] = s
        }
      }
    }
  }
  if (best[count][frames] === INF) {
    // Too many syllables for the audio: fall back to equal slices.
    return Array.from({ length: count }, (_, i) => ({
      start: (first + Math.floor((i * frames) / count)) * hop,
      end: (first + Math.floor(((i + 1) * frames) / count)) * hop,
    }))
  }
  const cuts: number[] = [frames]
  for (let k = count, t = frames; k > 0; k--) {
    t = from[k][t]
    cuts.unshift(t)
  }
  return cuts.slice(0, -1).map((c, i) => ({ start: (first + c) * hop, end: (first + cuts[i + 1]) * hop }))
}
