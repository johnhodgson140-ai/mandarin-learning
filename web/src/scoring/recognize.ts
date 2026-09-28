// The browser's own speech recognition (free, no key): used to check which sounds I made.
// Safari (iPhone) and Chrome support it for zh-CN; elsewhere scoring uses the tone model alone.

import { load, save } from '../services/storage.ts'

type Alternative = { transcript: string }
type ResultList = ArrayLike<ArrayLike<Alternative> & { isFinal: boolean }>
type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ResultList }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

function recognitionClass(): (new () => BrowserRecognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * On iPhone the recogniser takes over the audio after its first use, and the next recording hangs or comes out
 * silent. So it's off by default there (sounds are then checked by Azure, or not at all); Settings can turn it on.
 * It's also switched off if a recording comes out silent while it was running.
 */
const BLOCKED_KEY = 'recogniserBlocksMic'
const isIOS = () => typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
export const recogniserBlocked = () => load<boolean>(BLOCKED_KEY, isIOS())
export const setRecogniserBlocked = (blocked: boolean) => save(BLOCKED_KEY, blocked)

/** The phone's recogniser exists and hasn't been switched off. */
export const hasRecogniser = () => typeof window !== 'undefined' && recognitionClass() !== null
export const canRecognise = () => hasRecogniser() && !recogniserBlocked()

export type Listening = { stop(): Promise<string[]>; abort(): void }

/** Start listening (call from a tap/press). `stop()` resolves with up to 5 guesses of what was said. */
export function listen(): Listening | null {
  const Recognition = recognitionClass()
  if (!Recognition) return null
  const rec = new Recognition()
  rec.lang = 'zh-CN'
  rec.continuous = true
  rec.interimResults = false
  rec.maxAlternatives = 5
  let results: ResultList = []
  let ended = false
  const endWaiters: (() => void)[] = []
  rec.onresult = (e) => (results = e.results)
  rec.onerror = () => {}
  rec.onend = () => {
    ended = true
    endWaiters.forEach((f) => f())
  }
  try {
    rec.start()
  } catch {
    return null
  }
  return {
    stop: () =>
      new Promise<string[]>((resolve) => {
        const done = () => resolve(guesses(results))
        if (ended) return done()
        endWaiters.push(done)
        setTimeout(done, 2500) // don't hang if the recogniser never ends
        try {
          rec.stop()
        } catch {
          done()
        }
      }),
    abort: () => {
      try {
        rec.abort()
      } catch {
        // already stopped
      }
    },
  }
}

/** One result: its alternatives. Several results (pauses): the top guesses joined. */
function guesses(results: ResultList): string[] {
  if (results.length === 0) return []
  if (results.length === 1) return Array.from(results[0], (a) => a.transcript)
  return [Array.from(results, (r) => r[0]?.transcript ?? '').join('')]
}
