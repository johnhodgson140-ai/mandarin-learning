export const TARGET_RATE = 16_000

/** Downsample by averaging each output sample's input window (a simple anti-alias box filter). */
export function downsample(input: Float32Array, inRate: number, outRate = TARGET_RATE): Float32Array {
  if (inRate === outRate) return input
  if (inRate < outRate) throw new Error(`cannot upsample ${inRate} Hz to ${outRate} Hz`)
  const ratio = inRate / outRate
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / (end - start)
  }
  return out
}

/** Encode mono Float32 samples (-1..1) as a 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** 16-bit PCM WAV (as the recorder makes it) → Float32 samples. */
export async function wavSamples(wav: Blob): Promise<Float32Array> {
  const view = new DataView(await wav.arrayBuffer())
  const count = Math.max(0, (view.byteLength - 44) >> 1)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) out[i] = view.getInt16(44 + i * 2, true) / 0x8000
  return out
}

/** Any audio the browser can play (e.g. Azure's MP3) → 16 kHz mono samples. */
export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, TARGET_RATE, TARGET_RATE)
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
  return buffer.getChannelData(0)
}
