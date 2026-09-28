import { useEffect, useRef, useState } from 'react'
import { preloadRecorder, Recorder, type Recording } from '../audio/recorder.ts'
import { canRecognise, listen as startListening, setRecogniserBlocked, type Listening } from '../scoring/recognize.ts'
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

  // Latest callbacks, so the max-length / visibility handlers never call a stale closure.
  const callbacks = useRef({ onRecorded, onError })
  callbacks.current = { onRecorded, onError }

  async function begin() {
    if (recorder.current) return
    const rec = new Recorder({
      onLevel: (l) => {
        peak.current = Math.max(peak.current, l)
        setLevel(l)
      },
      onMaxLength: () => void end(),
    })
    recorder.current = rec
    peak.current = 0
    usedRecogniser.current = listen && canRecognise()
    listening.current = usedRecogniser.current ? startListening() : null // must start inside the tap
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
    live.current = false
    setPhase('idle')
    if (!(await starting.current)) return // start failed; begin() already reported it
    if (!wasLive) {
      // Stopped before the mic was live (always the case on the first permission prompt).
      await rec.cancel()
      listening.current?.abort()
      setHint('Microphone ready. Tap to start speaking.')
      return
    }
    try {
      const result = await rec.stop()
      const heard = await listening.current?.stop()
      listening.current = null
      if (result.seconds < MIN_SECONDS) setHint('Too short. Tap, speak, then tap again when finished.')
      else if (peak.current < SILENT_PEAK) {
        if (usedRecogniser.current) {
          // On some iPhones the recogniser takes the microphone: stop using it (Settings can turn it back on).
          setRecogniserBlocked(true)
          setHint("No sound reached the app: the iPhone's speech recogniser was using the mic. Fixed, tap to try again.")
        } else setHint('No sound was recorded. Check the microphone is allowed (iPhone Settings → Safari → Microphone) and not in use by a call or Siri.')
      }
      else callbacks.current.onRecorded(heard?.length ? { ...result, heard } : result)
    } catch (err) {
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
        // A tap while the mic is still starting does nothing: it starts recording by itself.
        onClick={() => void (phase === 'idle' ? begin() : phase === 'recording' ? end() : undefined)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
      </button>
      <div className="level" aria-hidden="true">
        <div className="level-fill" style={{ transform: `scaleX(${level})` }} />
      </div>
      {hint && <p className="muted hold-hint">{hint}</p>}
    </div>
  )
}

function micErrorMessage(err: unknown): string {
  if (!window.isSecureContext || !navigator.mediaDevices)
    return 'The microphone needs a secure page. Open the app from its https:// link.'
  if (err instanceof DOMException && err.name === 'NotAllowedError')
    return 'Microphone permission was denied. Allow it in your browser settings and try again.'
  if (err instanceof DOMException && err.name === 'NotFoundError') return 'No microphone found.'
  return err instanceof Error ? err.message : String(err)
}
