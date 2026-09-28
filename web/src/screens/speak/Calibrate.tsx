import { useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { TARGET_RATE, wavSamples } from '../../audio/wav.ts'
import type { Tone } from '../../chinese/tones.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import VoicePicker from '../../components/VoicePicker.tsx'
import { saveProfile, toneLabel } from '../../services/tone.ts'
import { speak } from '../../services/tts.ts'
import { activeVoice } from '../../services/voices.ts'
import { predict } from '../../tone/model.ts'

const SYLLABLES: { hanzi: string; pinyin: string; tone: Tone }[] = [
  { hanzi: '妈', pinyin: 'mā', tone: 1 },
  { hanzi: '麻', pinyin: 'má', tone: 2 },
  { hanzi: '马', pinyin: 'mǎ', tone: 3 },
  { hanzi: '骂', pinyin: 'mà', tone: 4 },
]

export default function Calibrate() {
  const [samples, setSamples] = useState<Float32Array[]>([])
  const [heard, setHeard] = useState<Tone[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [voiceName, setVoiceName] = useState(() => activeVoice().name)
  const current = SYLLABLES[samples.length]

  async function recorded(rec: Recording) {
    setError(null)
    const next = [...samples, await wavSamples(rec.wav)]
    setSamples(next)
    if (next.length === SYLLABLES.length) {
      const profile = await saveProfile(next)
      setHeard(next.map((s) => predict(s, TARGET_RATE, profile).tone))
    }
  }

  function redo() {
    setSamples([])
    setHeard(null)
  }

  const matched = heard?.filter((t, i) => t === SYLLABLES[i].tone).length ?? 0

  return (
    <>
      <header className="settings-header">
        <a href="#speak" className="back-link">‹ Speak</a>
        <h1>Calibrate a voice</h1>
      </header>
      {samples.length === 0 && !heard && (
        <>
          <p className="muted small">Whose voice?</p>
          <VoicePicker onChange={() => setVoiceName(activeVoice().name)} />
        </>
      )}
      {!heard && current && (
        <>
          <p className="muted">
            {voiceName}: say each syllable clearly in a normal voice. This teaches the app this voice's pitch range. ({samples.length + 1} of 4)
          </p>
          <div className="drill-card tone-colours">
            <p className="drill-hanzi zh">{current.hanzi}</p>
            <p className={`drill-pinyin t${current.tone}`}>{current.pinyin}</p>
            <button type="button" className="btn btn-secondary" onClick={() => speak(current.hanzi, 0.9)}>▶ Hear it</button>
          </div>
          <HoldToTalk key={samples.length} onRecorded={(r) => void recorded(r)} onError={setError} />
        </>
      )}
      {heard && (
        <section className="card">
          <h2 className="card-title">Saved for {voiceName}</h2>
          <ul className="calibration-list tone-colours">
            {SYLLABLES.map((s, i) => (
              <li key={s.hanzi}>
                <span className="zh">{s.hanzi}</span> <span className={`t${s.tone}`}>{s.pinyin}</span>
                <span className="muted"> · heard as {toneLabel(heard[i])}{heard[i] === s.tone ? ' ✓' : ''}</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            {matched === 4
              ? 'All four tones recognised. Tone checks are on.'
              : `${matched} of 4 recognised. Tone checks are on; if they feel off, redo this and exaggerate the tones a little.`}
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={redo}>Redo</button>
            <a href="#speak/dojo" className="btn btn-primary link-btn center">Tone Dojo</a>
          </div>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
