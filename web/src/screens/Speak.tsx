import { useEffect, useState } from 'react'
import HoldToTalk from '../components/HoldToTalk.tsx'
import type { Recording } from '../audio/recorder.ts'
import { TARGET_RATE } from '../audio/wav.ts'

/** M0: microphone proof. The five Speak rows replace this from M4 onwards. */
export default function Speak() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Hold the button, say something, release.')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  function handleRecorded(rec: Recording) {
    setError(null)
    setAudioUrl(URL.createObjectURL(rec.wav))
    setStatus(`Recorded ${rec.seconds.toFixed(1)} s at ${TARGET_RATE / 1000} kHz mono. Playing it back…`)
  }

  return (
    <>
      <h1>Speak</h1>
      <section className="card">
        <h2 className="card-title">Microphone check</h2>
        <p className="muted">{status}</p>
        <HoldToTalk onRecorded={handleRecorded} onError={setError} />
        {error && <p className="error" role="alert">{error}</p>}
        {audioUrl && <audio className="playback" src={audioUrl} controls autoPlay />}
      </section>
    </>
  )
}
