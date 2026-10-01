import workletUrl from './recorder-worklet.ts?worker&url'
import { downsample, encodeWav, TARGET_RATE } from './wav.ts'
import { log } from '../debug/log.ts'

export const MAX_SECONDS = 30

/** `heard`: the browser recogniser's guesses of what I said, when HoldToTalk was asked to listen. */
export type Recording = { wav: Blob; seconds: number; heard?: string[] }

/** Warm the HTTP cache for the worklet so the first press doesn't lose its opening words. */
export function preloadRecorder(): void {
  void fetch(workletUrl).catch(() => {})
}

/**
 * One microphone for the whole app, opened on the first tap and kept open while the app is on screen.
 * iPhones often give back a silent microphone when it's opened and closed for every recording (especially
 * after the speech recogniser or a playback has used the audio), so audio flows all the time and a
 * Recorder only keeps what arrives between its start() and stop(). Released when the app is hidden.
 */
class Mic {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private opening: Promise<void> | null = null
  /** Where audio batches go while a Recorder is capturing. */
  sink: ((chunk: Float32Array) => void) | null = null

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000
  }

  /** What the mic looks like right now (for the log). */
  state(): Record<string, unknown> {
    const track = this.stream?.getAudioTracks()[0]
    return {
      ctx: this.ctx?.state ?? 'none',
      rate: this.ctx?.sampleRate,
      track: track ? `${track.readyState}${track.muted ? ' muted' : ''}${track.enabled ? '' : ' disabled'}` : 'none',
      worklet: Boolean(this.node),
    }
  }

  /** Audio is actually arriving from the microphone (not just "open": iOS can hand back a dead one). */
  private flowing(): boolean {
    const track = this.stream?.getAudioTracks()[0]
    return Boolean(
      this.ctx?.state === 'running' &&
        this.node &&
        track?.readyState === 'live' &&
        !track.muted &&
        performance.now() - this.lastChunkAt < 1000,
    )
  }

  private lastChunkAt = -Infinity

  /**
   * Make sure audio is flowing. Call straight from a tap: iOS only lets audio start inside one.
   * Reuses the open mic only if audio is really arriving; otherwise builds a fresh one, checks audio arrives
   * within a second, and rebuilds once more if not (after leaving the site, iPhones can return a dead mic).
   * Every step has a time limit, so a tap never gets stuck.
   */
  open(): Promise<void> {
    if (this.opening) {
      log('mic open: already opening')
      return this.opening
    }
    if (this.flowing()) {
      log('mic open: reuse', this.state())
      return Promise.resolve()
    }
    log('mic open: fresh', this.state())
    this.release('replacing')
    const ctx = this.newContext() // created synchronously inside the tap, which is what unlocks audio on iOS
    const resumed = ctx.resume().catch(() => {})
    this.opening = (async () => {
      try {
        await this.build(ctx, resumed)
        if (await this.audioArrives()) return
        log('mic open: no audio, rebuilding', this.state())
        this.release('no audio')
        const retry = this.newContext() // allowed without a tap now: the microphone permission is active
        await this.build(retry, retry.resume().catch(() => {}))
        if (await this.audioArrives()) return
        log('mic open: still no audio', this.state())
        this.release('dead mic')
        throw new MicDead()
      } catch (err) {
        if (!(err instanceof MicDead)) {
          log('mic open failed', { error: String(err), ...this.state() })
          this.release('open failed')
        }
        throw err
      } finally {
        this.opening = null
      }
    })()
    return this.opening
  }

  private newContext(): AudioContext {
    const ctx = new AudioContext()
    ctx.onstatechange = () => log('audio context ' + ctx.state)
    this.ctx = ctx
    return ctx
  }

  private async build(first: AudioContext, resumed: Promise<void>): Promise<void> {
    let ctx = first
    const stream = await timeLimit(
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
      30_000, // includes the permission prompt
    )
    this.stream = stream
    const track = stream.getAudioTracks()[0]
    const { sampleRate, echoCancellation, noiseSuppression, autoGainControl } = track?.getSettings() ?? {}
    log('mic granted', { label: track?.label, muted: track?.muted, sampleRate, echoCancellation, noiseSuppression, autoGainControl })
    if (track) {
      track.onmute = () => log('mic track muted')
      track.onunmute = () => log('mic track unmuted')
      track.onended = () => log('mic track ended')
    }
    // Starting the mic switches the iPhone's audio mode and can interrupt a context started just before it.
    await Promise.race([resumed, sleep(1000)])
    if (ctx.state !== 'running') await timeLimit(ctx.resume(), 1000).catch(() => {})
    if (ctx.state !== 'running') {
      log('audio context stuck: replacing', { state: ctx.state })
      void ctx.close().catch(() => {})
      ctx = this.newContext()
      await timeLimit(ctx.resume(), 1000).catch(() => {})
    }
    await timeLimit(ctx.audioWorklet.addModule(workletUrl), 5000)
    const node = new AudioWorkletNode(ctx, 'recorder')
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.receive(e.data)
    ctx.createMediaStreamSource(stream).connect(node)
    this.node = node
    this.lastChunkAt = -Infinity
    log('mic open: built', this.state())
  }

  private receive(chunk: Float32Array) {
    this.lastChunkAt = performance.now()
    this.sink?.(chunk)
  }

  /** Wait up to ~1 s for the first audio from the worklet. */
  private async audioArrives(): Promise<boolean> {
    for (let waited = 0; waited < 1000; waited += 50) {
      if (this.flowing()) {
        log('mic open: audio flowing', { afterMs: waited, ...this.state() })
        return true
      }
      await sleep(50)
    }
    return false
  }

  /** Drop anything the worklet collected before this moment. */
  reset(): void {
    this.node?.port.postMessage('reset')
  }

  /** Ask the worklet for its last partial batch; resolves once it has arrived (or after 200 ms). */
  flush(): Promise<void> {
    const node = this.node
    if (!node) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const onFlushed = (e: MessageEvent<Float32Array>) => {
        this.receive(e.data)
        node.port.onmessage = (ev: MessageEvent<Float32Array>) => this.receive(ev.data)
        resolve()
      }
      node.port.onmessage = onFlushed
      node.port.postMessage('flush')
      setTimeout(resolve, 200)
    })
  }

  release(reason = ''): void {
    if (this.ctx || this.stream) log('mic release', { reason })
    this.sink = null
    this.node?.port.close()
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {})
    this.node = null
    this.stream = null
    this.ctx = null
  }
}

const mic = new Mic()

/** The iPhone gives the page no microphone audio at all; only reloading the page brings it back. */
export class MicDead extends Error {
  constructor() {
    super("The iPhone isn't giving the app any microphone audio.")
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class MicTimeout extends Error {
  constructor() {
    super("The microphone didn't start. Tap to try again.")
  }
}

function timeLimit<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MicTimeout()), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') mic.release('app hidden')
  })
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => mic.release('left the page'))

/**
 * One recording from the shared microphone → 16 kHz mono WAV.
 * Call `start()` from a tap (required on iOS). `onLevel` gets a 0..1 loudness value per batch.
 */
export class Recorder {
  private chunks: Float32Array[] = []
  private length = 0
  private capturing = false
  /** The microphone's rate when recording started (the app being hidden mid-recording closes the microphone). */
  private rate = 48000
  private readonly sink = (chunk: Float32Array) => this.push(chunk)
  private onLevel: (level: number) => void
  private onMaxLength: () => void

  constructor(opts: { onLevel?: (level: number) => void; onMaxLength?: () => void } = {}) {
    this.onLevel = opts.onLevel ?? (() => {})
    this.onMaxLength = opts.onMaxLength ?? (() => {})
  }

  async start(): Promise<void> {
    this.chunks = []
    this.length = 0
    await mic.open()
    mic.reset()
    this.rate = mic.sampleRate
    log('recording start', mic.state())
    this.capturing = true
    mic.sink = this.sink
  }

  private push(chunk: Float32Array) {
    if (!this.capturing) return
    this.chunks.push(chunk)
    this.length += chunk.length
    let sum = 0
    for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
    const rms = Math.sqrt(sum / Math.max(chunk.length, 1))
    this.onLevel(Math.min(1, rms * 6))
    if (this.length >= MAX_SECONDS * this.rate) this.onMaxLength()
  }

  async stop(): Promise<Recording> {
    if (!this.capturing) throw new Error('recorder is not running')
    await mic.flush()
    this.detach()
    log('recording stop', { chunks: this.chunks.length, seconds: Math.round((this.length / this.rate) * 10) / 10, ...mic.state() })
    const inRate = this.rate
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

  /** Stop without producing a recording (e.g. the screen is closing). The microphone stays open. */
  async cancel(): Promise<void> {
    if (this.capturing) log('recording cancelled')
    this.detach()
    this.chunks = []
    this.length = 0
  }

  private detach() {
    this.capturing = false
    if (mic.sink === this.sink) mic.sink = null
  }
}

/** Close the microphone now (e.g. a recording came out silent, so the next tap gets a fresh one). */
export const reopenMicNextTime = () => mic.release('silent recording')
