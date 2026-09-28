import { useEffect, useRef, useState } from 'react'
import { MicDead, preloadRecorder, Recorder, reopenMicNextTime, type Recording } from '../audio/recorder.ts'
import { canRecognise, listen as startListening, setRecogniserBlocked, type Listening } from '../scoring/recognize.ts'
import { flushLog, log } from '../debug/log.ts'
import { isNativeApp, nativeRecognise } from '../native/app.ts'
import { stopPlayback } from '../services/tts.ts'
import './HoldToTalk.css'

type Props = {
  onRecorded: (rec: Recording) => void
  onError: (message: string) => void
  /** Also run the browser's speech recogniser, for free pronunciation scoring. */
  listen?: boolean
}

type Phase = 'idle' | 'starting' | 'recording'

const MIN_SECONDS = 0.3
const SILENT_PEAK = 0.01 // loudest moment below this: nothing reached the app
let silentInARow = 0 // across screens: two silent recordings in a row means the iPhone's mic needs a reload

/** One large talk button (tap to start, tap to stop) with a single-bar level meter. */
export default function HoldToTalk({ onRecorded, onError, listen = false }: Props) {
  const recorder = useRef<Recorder | null>(null)
  const starting = useRef<Promise<boolean> | null>(null)
  const listening = useRef<Listening | null>(null)
  const live = useRef(false) // mic is actually capturing (a ref, so timers never read stale state)
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const peak = useRef(0)
  const usedRecogniser = useRef(false)
  const [hint, setHint] = useState<string | null>(null)
  const [needsReload, setNeedsReload] = useState(false)

  // Latest callbacks, so the max-length / visibility handlers never call a stale closure.
  const callbacks = useRef({ onRecorded, onError, listen })
  callbacks.current = { onRecorded, onError, listen }

  async function begin() {
    if (recorder.current) return log('tap ignored: already recording')
    stopPlayback() // never record the app's own voice or a playback
    const rec = new Recorder({
      onLevel: (l) => {
        peak.current = Math.max(peak.current, l)
        setLevel(l)
      },
      onMaxLength: () => void end(),
    })
    recorder.current = rec
    peak.current = 0
    // The iOS app checks the finished recording natively instead (see end()).
    usedRecogniser.current = listen && !isNativeApp() && canRecognise()
    listening.current = usedRecogniser.current ? startListening() : null // must start inside the tap
    log('tap: start', { recogniser: usedRecogniser.current })
    live.current = false
    setHint(null)
    setPhase('starting')
    starting.current = rec.start().then(
      () => {
        if (recorder.current === rec) {
          live.current = true
          setPhase('recording')
        }
        return true
      },
      (err: unknown) => {
        log('start failed', { error: String(err) })
        if (err instanceof MicDead) setNeedsReload(true)
        if (recorder.current === rec) {
          recorder.current = null
          setPhase('idle')
        }
        callbacks.current.onError(micErrorMessage(err))
        return false
      },
    )
  }

  async function end() {
    const rec = recorder.current
    if (!rec) return
    recorder.current = null
    setLevel(0)
    const wasLive = live.current
    log('tap: stop', { wasLive })
    live.current = false
    setPhase('idle')
    if (!(await starting.current)) return // start failed; begin() already reported it
    if (!wasLive) {
      // Stopped before the mic was live (always the case on the first permission prompt).
      await rec.cancel()
      listening.current?.abort()
      setHint('Stopped. Tap to start again.')
      return
    }
    try {
      const result = await rec.stop()
      setLevel(0) // the last batch arrives during stop()
      const heard = callbacks.current.listen && isNativeApp() ? await nativeRecognise(result.wav) : await listening.current?.stop()
      listening.current = null
      log('result', { seconds: Math.round(result.seconds * 10) / 10, peak: Math.round(peak.current * 1000) / 1000, heard: heard?.length ?? null })
      if (result.seconds < MIN_SECONDS) setHint('Too short. Tap, speak, then tap again when finished.')
      else if (peak.current < SILENT_PEAK) {
        reopenMicNextTime() // get a fresh microphone on the next tap
        silentInARow++
        if (silentInARow >= 2) setNeedsReload(true)
        if (usedRecogniser.current) {
          // On some iPhones the recogniser takes the microphone: stop using it (Settings can turn it back on).
          setRecogniserBlocked(true)
          setHint("No sound reached the app: the iPhone's speech recogniser was using the mic. Fixed, tap to try again.")
        } else setHint('No sound was recorded. Tap to try again. If it keeps happening, check the microphone is allowed (iPhone Settings → Safari → Microphone).')
      }
      else {
        silentInARow = 0
        callbacks.current.onRecorded(heard?.length ? { ...result, heard } : result)
      }
    } catch (err) {
      log('stop failed', { error: String(err) })
      callbacks.current.onError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    preloadRecorder()
    // Leaving the app mid-recording (iOS app switch, locking the phone): finish the clip.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void end()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      // Switching tabs mid-recording: release the microphone, keep nothing.
      const rec = recorder.current
      recorder.current = null
      listening.current?.abort()
      void starting.current?.then(() => rec?.cancel())
    }
  }, [])

  const label = phase === 'starting' ? 'Starting mic…' : phase === 'recording' ? 'Tap when finished' : 'Tap to speak'

  return (
    <div className="hold">
      <button
        type="button"
        className="hold-button"
        data-recording={phase === 'recording' || undefined}
        // A tap while the mic is still starting cancels it, so the button can never get stuck.
        onClick={() => void (phase === 'idle' ? begin() : end())}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
      </button>
      <div className="level" aria-hidden="true">
        <div className="level-fill" style={{ transform: `scaleX(${level})` }} />
      </div>
      {hint && <p className="muted hold-hint">{hint}</p>}
      {needsReload && (
        <div className="hold-hint">
          <p className="muted">The iPhone has stopped giving the app microphone audio (this happens after leaving the app). A reload fixes it.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              log('fix microphone: reload')
              flushLog()
              location.reload()
            }}
          >
            Fix microphone
          </button>
        </div>
      )}
    </div>
  )
}

function micErrorMessage(err: unknown): string {
  if (!window.isSecureContext || !navigator.mediaDevices)
    return 'The microphone needs a secure page. Open the app from its https:// link.'
  if (err instanceof DOMException && err.name === 'NotAllowedError')
    return 'Microphone permission was denied. Allow it in your browser settings and try again.'
  if (err instanceof DOMException && err.name === 'NotFoundError') return 'No microphone found.'
  if (err instanceof MicDead) return err.message
  return err instanceof Error ? err.message : String(err)
}
