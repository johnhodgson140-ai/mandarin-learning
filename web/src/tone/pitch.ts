// Pitch tracking (YIN) on 16 kHz mono audio. Pure maths, no browser APIs.

export const FRAME_MS = 40
export const HOP_MS = 10
const MIN_HZ = 70
const MAX_HZ = 500
const YIN_THRESHOLD = 0.15
const SILENCE_RMS = 0.01

/** f0 in Hz per 10 ms frame, or null where there's no voiced pitch (silence, breath, consonants). */
export function pitchTrack(audio: Float32Array, sampleRate: number): (number | null)[] {
  const frame = Math.round((FRAME_MS / 1000) * sampleRate)
  const hop = Math.round((HOP_MS / 1000) * sampleRate)
  const maxLag = Math.floor(sampleRate / MIN_HZ)
  const minLag = Math.floor(sampleRate / MAX_HZ)
  const window = Math.min(frame, audio.length) - maxLag
  const out: (number | null)[] = []
  if (window <= 0) return out
  const diff = new Float32Array(maxLag + 1)

  for (let start = 0; start + window + maxLag <= audio.length; start += hop) {
    let energy = 0
    for (let i = 0; i < window; i++) energy += audio[start + i] ** 2
    if (Math.sqrt(energy / window) < SILENCE_RMS) {
      out.push(null)
      continue
    }
    // Difference function + cumulative mean normalisation (YIN steps 2–3).
    let running = 0
    diff[0] = 1
    for (let lag = 1; lag <= maxLag; lag++) {
      let d = 0
      for (let i = 0; i < window; i++) {
        const delta = audio[start + i] - audio[start + i + lag]
        d += delta * delta
      }
      running += d
      diff[lag] = running > 0 ? (d * lag) / running : 1
    }
    // First dip under the threshold (step 4), refined by parabolic interpolation (step 5).
    let lag = -1
    for (let l = minLag; l <= maxLag; l++) {
      if (diff[l] < YIN_THRESHOLD) {
        while (l + 1 <= maxLag && diff[l + 1] < diff[l]) l++
        lag = l
        break
      }
    }
    if (lag < 0) {
      out.push(null)
      continue
    }
    const a = diff[lag - 1] ?? diff[lag]
    const b = diff[lag]
    const c = diff[lag + 1] ?? diff[lag]
    const shift = a + c - 2 * b !== 0 ? (a - c) / (2 * (a + c - 2 * b)) : 0
    out.push(sampleRate / (lag + shift))
  }
  return out
}

/** Per pitchTrack frame: is there sound (voiced or not) rather than silence? Same framing as pitchTrack. */
export function frameLoudness(audio: Float32Array, sampleRate: number): boolean[] {
  const frame = Math.round((FRAME_MS / 1000) * sampleRate)
  const hop = Math.round((HOP_MS / 1000) * sampleRate)
  const maxLag = Math.floor(sampleRate / MIN_HZ)
  const window = Math.min(frame, audio.length) - maxLag
  const out: boolean[] = []
  if (window <= 0) return out
  for (let start = 0; start + window + maxLag <= audio.length; start += hop) {
    let energy = 0
    for (let i = 0; i < window; i++) energy += audio[start + i] ** 2
    out.push(Math.sqrt(energy / window) >= SILENCE_RMS)
  }
  return out
}

/** Semitones relative to 100 Hz: equal steps sound equal, whatever the voice. */
export const semitones = (hz: number) => 12 * Math.log2(hz / 100)
