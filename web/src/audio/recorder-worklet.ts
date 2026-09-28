// Runs on the audio thread. Collects mono Float32 samples and posts them to
// the main thread in ~2048-frame batches (the render quantum is only 128).

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

const BATCH = 2048

class RecorderProcessor extends AudioWorkletProcessor {
  private buffer = new Float32Array(BATCH)
  private filled = 0

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<string>) => {
      if (e.data === 'flush') {
        this.port.postMessage(this.buffer.slice(0, this.filled))
        this.filled = 0
      }
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i]
      if (this.filled === BATCH) {
        this.port.postMessage(this.buffer.slice())
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('recorder', RecorderProcessor)
