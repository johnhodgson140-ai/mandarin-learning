import { useEffect, useRef, useState } from 'react'
import { preloadRecorder, Recorder, type Recording } from '../audio/recorder.ts'
import './HoldToTalk.css'

type Props = { onRecorded: (rec: Recording) => void; onError: (message: string) => void }

type Phase = 'idle' | 'starting' | 'recording'

const MIN_SECONDS = 0.3

/** One large hold-to-talk button (pointer, or Space/Enter on desktop) with a single-bar level meter. */
export default function HoldToTalk({ onRecorded, onError }: Props) {
  const recorder = useRef<Recorder | null>(null)
  const starting = useRef<Promise<boolean> | null>(null)
  const live = useRef(false) // mic is actually capturing (a ref, so timers never read stale state)
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [hint, setHint] = useState<string | null>(null)

  // Latest callbacks, so the max-length / visibility handlers never call a stale closure.
  const callbacks = useRef({ onRecorded, onError })
  callbacks.current = { onRecorded, onError }

  async function begin() {
    if (recorder.current) return
    const rec = new Recorder({ onLevel: setLevel, onMaxLength: () => void end() })
    recorder.current = rec
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
      // Released before the mic was live (always the case on the first permission prompt).
      await rec.cancel()
      setHint('Microphone ready. Hold the button while you speak.')
      return
    }
    try {
      const result = await rec.stop()
      if (result.seconds < MIN_SECONDS) setHint('Too short. Hold the button while you speak.')
      else callbacks.current.onRecorded(result)
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
      void starting.current?.then(() => rec?.cancel())
    }
  }, [])

  const isHoldKey = (e: React.KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

  return (
    <div className="hold">
      <button
        type="button"
        className="hold-button"
        data-recording={phase === 'recording' || undefined}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          void begin()
        }}
        onPointerUp={() => void end()}
        onPointerCancel={() => void end()}
        onKeyDown={(e) => {
          if (!isHoldKey(e)) return
          e.preventDefault()
          if (!e.repeat) void begin()
        }}
        onKeyUp={(e) => {
          if (!isHoldKey(e)) return
          e.preventDefault()
          void end()
        }}
        onBlur={() => void end()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {phase === 'idle' ? 'Hold to talk' : phase === 'starting' ? 'Starting mic…' : 'Listening… release to stop'}
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
