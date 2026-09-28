// "Hear yourself say it right": re-pitch my own recording so each syllable follows the correct tone, keeping
// my voice, timing and sounds. TD-PSOLA: cut the voiced parts into single pitch periods (windowed around
// pitch marks) and lay them out again at the spacing of the target pitch; unvoiced parts pass through.
// Pure maths, no browser APIs.

import { HOP_MS, pitchTrack } from './pitch.ts'

/**
 * `target[f]`: the pitch (Hz) wanted for 10 ms frame f, or null to keep the original there.
 * Returns audio of the same length.
 */
export function retune(audio: Float32Array, sampleRate: number, target: (number | null)[]): Float32Array {
  const hop = Math.round((HOP_MS / 1000) * sampleRate)
  const f0 = fillGaps(pitchTrack(audio, sampleRate), 3)
  const at = (i: number) => f0[Math.min(f0.length - 1, Math.floor(i / hop))] ?? null
  const want = (i: number) => target[Math.min(target.length - 1, Math.floor(i / hop))] ?? null

  // Analysis pitch marks: one per period through the voiced parts, each on the local waveform peak.
  const marks: number[] = []
  for (let i = 0; i < audio.length; ) {
    const hz = at(i)
    if (hz === null) {
      i += hop
      continue
    }
    const period = sampleRate / hz
    const from = Math.max(0, Math.round(i - period * 0.3))
    const to = Math.min(audio.length - 1, Math.round(i + period * 0.3))
    let peak = from
    for (let j = from; j <= to; j++) if (audio[j] > audio[peak]) peak = j
    if (marks.length === 0 || peak > marks[marks.length - 1] + period * 0.5) marks.push(peak)
    i = Math.max(peak, i) + Math.round(period)
  }

  const out = new Float32Array(audio.length)
  const weight = new Float32Array(audio.length)
  const addGrain = (centre: number, source: number, half: number) => {
    for (let k = -half; k < half; k++) {
      const s = source + k
      const o = centre + k
      if (s < 0 || s >= audio.length || o < 0 || o >= audio.length) continue
      const w = 0.5 - 0.5 * Math.cos((Math.PI * (k + half)) / half) // Hann over 2 periods
      out[o] += audio[s] * w
      weight[o] += w
    }
  }

  // Synthesis: walk through time; in voiced parts place a grain every target period (taken from the nearest
  // analysis mark), elsewhere copy with fixed overlapping windows.
  const fixedHalf = hop
  let m = 0
  let voiced = false
  for (let t = 0; t < audio.length; ) {
    const hz = at(t)
    if (hz === null || marks.length === 0) {
      addGrain(t, t, fixedHalf)
      t += fixedHalf
      voiced = false
      continue
    }
    while (m + 1 < marks.length && Math.abs(marks[m + 1] - t) <= Math.abs(marks[m] - t)) m++
    if (!voiced) {
      // Entering a voiced stretch: start on the pitch mark itself, so the grains line up with the voice's pulses.
      voiced = true
      if (marks[m] < t && m + 1 < marks.length) m++
      if (marks[m] > t && marks[m] - t < hop * 3) t = marks[m]
    }
    const sourcePeriod = Math.round(sampleRate / hz)
    const goal = want(t)
    addGrain(t, marks[m], sourcePeriod)
    // No change wanted here: follow the original pulses exactly. Otherwise space grains at the target period.
    if (goal === null && m + 1 < marks.length && marks[m + 1] > t) t = marks[m + 1]
    else t += Math.max(8, Math.round(sampleRate / (goal ?? hz)))
  }
  for (let i = 0; i < out.length; i++) out[i] = weight[i] > 1e-3 ? out[i] / weight[i] : audio[i]
  return out
}

/** Fill unvoiced gaps of up to `max` frames inside voiced stretches (pitch tracker dropouts). */
function fillGaps(track: (number | null)[], max: number): (number | null)[] {
  const out = [...track]
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) continue
    let j = i
    while (j < out.length && out[j] === null) j++
    const before = out[i - 1]
    const after = out[j]
    if (j - i <= max && before != null && after != null)
      for (let k = i; k < j; k++) out[k] = before + ((after - before) * (k - i + 1)) / (j - i + 1)
    i = j
  }
  return out
}
