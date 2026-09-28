import { useState } from 'react'
import type { Token } from '../../chinese/tokens.ts'
import type { Recording } from '../../audio/recorder.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import { gradeParagraph, type ParagraphResult } from '../../grading/readAloud.ts'
import { canRecognise } from '../../scoring/recognize.ts'
import { getKeys } from '../../services/keys.ts'
import { rateForLevel, speak } from '../../services/tts.ts'

type Props = {
  tokens: Token[]
  storyId: string
  paragraph: number
  level: number
  result: ParagraphResult | undefined
  onResult: (result: ParagraphResult | undefined) => void
  onClose: () => void
}

/** Record a paragraph, grade it, show the totals. The underlines appear on the paragraph itself. */
export default function ReadAloudSheet({ tokens, storyId, paragraph, level, result, onResult, onClose }: Props) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasAzure = Boolean(getKeys().azure)
  const canGrade = hasAzure || canRecognise()
  const text = tokens.map((t) => t.text).join('')

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      onResult(await gradeParagraph(tokens, rec, storyId, paragraph))
      navigator.vibrate?.(15)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="word-sheet read-aloud-sheet" role="dialog" aria-label="Read aloud">
        <button type="button" className="sheet-close icon-btn" onClick={onClose} aria-label="Close">×</button>
        <h2 className="card-title">Read aloud</h2>

        {!canGrade && (
          <p className="muted">
            This browser can't check speech by itself: add your Azure Speech key in <a href="#settings">Settings</a>.
          </p>
        )}

        {canGrade && !result && !checking && (
          <>
            <p className="muted">Read the paragraph out loud, then tap again.</p>
            <HoldToTalk mode="toggle" listen={!hasAzure} onRecorded={grade} onError={setError} />
            {!hasAzure && <p className="muted small">Free check of your sounds. An Azure key (Settings) adds tones and fluency.</p>}
          </>
        )}

        {checking && <p className="muted" role="status">Checking your reading…</p>}

        {result && !checking && (
          <>
            <dl className="counts counts-3">
              <div><dt>Accuracy</dt><dd>{result.scores.accuracy}</dd></div>
              <div><dt>Fluency</dt><dd>{result.scores.fluency ?? '–'}</dd></div>
              <div><dt>Completeness</dt><dd>{result.scores.completeness}</dd></div>
            </dl>
            <p className="muted small">
              <span className="legend st-minor">Amber</span> close · <span className="legend st-wrong">red</span> needs work
            </p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-secondary" onClick={() => playBlob(result.wav)}>
                ▶ Mine
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => speak(text, rateForLevel(level))}>
                ▶ Native
              </button>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onResult(undefined)}>
              Try again
            </button>
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </>
  )
}

function playBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.onended = () => URL.revokeObjectURL(url)
  void audio.play()
}
