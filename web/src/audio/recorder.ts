import workletUrl from './recorder-worklet.ts?worker&url'
import { downsample, encodeWav, TARGET_RATE } from './wav.ts'

export const MAX_SECONDS = 30

export type Recording = { wav: Blob; seconds: number }

/** Warm the HTTP cache for the worklet so the first press doesn't lose its opening words. */
export function preloadRecorder(): void {
  void fetch(workletUrl).catch(() => {})
}

/**
 * Microphone → AudioWorklet → 16 kHz mono WAV.
 * Call `start()` from a user gesture (required on iOS). `onLevel` gets a 0..1 loudness value per batch.
 */
export class Recorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private chunks: Float32Array[] = []
  private length = 0
  private onLevel: (level: number) => void
  private onMaxLength: () => void

  constructor(opts: { onLevel?: (level: number) => void; onMaxLength?: () => void } = {}) {
    this.onLevel = opts.onLevel ?? (() => {})
    this.onMaxLength = opts.onMaxLength ?? (() => {})
  }

  async start(): Promise<void> {
    // Create the context synchronously inside the gesture so iOS lets it run.
    const ctx = new AudioContext()
    this.ctx = ctx
    this.chunks = []
    this.length = 0
    try {
      const resumed = ctx.resume()
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      await resumed
      await ctx.audioWorklet.addModule(workletUrl)
      const source = ctx.createMediaStreamSource(this.stream)
      const node = new AudioWorkletNode(ctx, 'recorder')
      node.port.onmessage = (e: MessageEvent<Float32Array>) => this.push(e.data)
      source.connect(node)
      this.node = node
    } catch (err) {
      await this.cleanup()
      throw err
    }
  }

  private push(chunk: Float32Array) {
    if (!this.ctx) return
    this.chunks.push(chunk)
    this.length += chunk.length
    let sum = 0
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
    const rms = Math.sqrt(sum / Math.max(chunk.length, 1))
    this.onLevel(Math.min(1, rms * 6))
    if (this.length >= MAX_SECONDS * this.ctx.sampleRate) this.onMaxLength()
  }

  async stop(): Promise<Recording> {
    const ctx = this.ctx
    const node = this.node
    if (!ctx || !node) throw new Error('recorder is not running')
    // Ask the worklet for its partial batch before tearing down.
    await new Promise<void>((resolve) => {
      const prev = node.port.onmessage
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        prev?.call(node.port, e)
        resolve()
      }
      node.port.postMessage('flush')
      setTimeout(resolve, 200)
    })
    const inRate = ctx.sampleRate
    await this.cleanup()

    const joined = new Float32Array(Math.min(this.length, MAX_SECONDS * inRate))
    let offset = 0
    for (const c of this.chunks) {
      if (offset >= joined.length) break
      joined.set(c.subarray(0, joined.length - offset), offset)
      offset += c.length
    }
    this.chunks = []
    const samples = downsample(joined, inRate)
    return { wav: encodeWav(samples), seconds: samples.length / TARGET_RATE }
  }

  /** Stop without producing a recording (e.g. the screen is closing). */
  async cancel(): Promise<void> {
    this.chunks = []
    this.length = 0
    await this.cleanup()
  }

  private async cleanup() {
    this.node?.port.close()
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close()
    this.node = null
    this.stream = null
    this.ctx = null
  }
}
