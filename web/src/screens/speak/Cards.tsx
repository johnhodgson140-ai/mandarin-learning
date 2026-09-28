import { useMemo, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { pickSession, type Card } from '../../cards/srs.ts'
import { buildParagraph } from '../../chinese/tokens.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import ScoreView from '../../components/ScoreView.tsx'
import { canRecognise } from '../../scoring/recognize.ts'
import { scoreAndLog } from '../../scoring/attempt.ts'
import type { SpeechScore } from '../../scoring/speechScore.ts'
import { allCards, cardStates, recordCard } from '../../services/cards.ts'
import { load, save } from '../../services/storage.ts'
import { getProfile } from '../../services/tone.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

type Mode = 'read' | 'recall'

export default function Cards() {
  const [mode, setMode] = useState<Mode>(() => load<Mode>('cardMode', 'read'))
  const [session, setSession] = useState<Card[]>(() => pickSession(allCards(), cardStates()))
  const [index, setIndex] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const canScore = canRecognise() || getProfile() !== null

  const chooseMode = (m: Mode) => {
    setMode(m)
    save('cardMode', m)
  }

  if (index >= session.length) {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return (
      <>
        <a href="#speak" className="back-link">‹ Speak</a>
        <h1>Say your cards</h1>
        <section className="card">
          <h2 className="card-title">{session.length ? 'Session done' : 'Nothing due right now'}</h2>
          {session.length > 0 && <p>{scores.length} cards · average {avg}/100</p>}
          <div className="sheet-actions">
            <a href="#speak" className="btn btn-secondary link-btn center">Speak</a>
            <button type="button" className="btn btn-primary" onClick={() => { setSession(pickSession(allCards(), cardStates(), { newPerSession: 6 })); setIndex(0); setScores([]) }}>
              More cards
            </button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="reading-progress" style={{ transform: `scaleX(${index / session.length})` }} aria-hidden="true" />
      <header className="mission-bar">
        <a href="#speak" className="back-link">‹ Speak</a>
        <div className="mission-toggles">
          <button type="button" className="chip" aria-pressed={mode === 'read'} onClick={() => chooseMode('read')}>Read</button>
          <button type="button" className="chip" aria-pressed={mode === 'recall'} onClick={() => chooseMode('recall')}>Recall</button>
        </div>
      </header>
      {!canScore && (
        <p className="muted small">
          This browser has no speech recogniser: <a href="#speak/calibrate">calibrate your voice</a> so tones can still be scored.
        </p>
      )}
      <CardView
        key={`${index}-${mode}`}
        card={session[index]}
        mode={mode}
        onNext={(score) => {
          if (score !== null) {
            recordCard(session[index].hanzi, score)
            setScores([...scores, score])
          }
          setIndex(index + 1)
        }}
      />
    </>
  )
}

function CardView({ card, mode, onNext }: { card: Card; mode: Mode; onNext: (score: number | null) => void }) {
  const [token] = useMemo(() => buildParagraph([card.hanzi], getLexicon()), [card.hanzi])
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<SpeechScore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rate = rateForLevel(load('level', 1))
  const revealed = mode === 'read' || result !== null

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      const r = await scoreAndLog(card.hanzi, token.syllables, rec, 'card')
      setResult(r)
      navigator.vibrate?.(r.overall >= 80 ? 10 : [10, 60, 10])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="drill-card tone-colours">
        {revealed ? <p className="drill-hanzi zh">{card.hanzi}</p> : <p className="drill-english">{card.english || '(no meaning yet)'}</p>}
        {revealed && card.english && <p className="muted">{card.english}</p>}
        {result && (
          <p className="drill-pinyin">
            {token.syllables.map((s, i) => <span key={i} className={`t${s.written}`}>{s.pinyin}</span>)}
          </p>
        )}
        <span className="muted small">{card.source === 'anki' ? 'Anki' : card.source === 'app' ? 'Starter words' : card.source === 'story' ? 'From a story' : 'From a mission'}</span>
        {(mode === 'read' || result) && (
          <button type="button" className="btn btn-secondary" onClick={() => speak(card.hanzi, rate)}>▶ Hear it</button>
        )}
      </div>

      {!result && !checking && <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Scoring…</p>}
      {result && (
        <section className="card fade-in">
          <ScoreView syllables={token.syllables} result={result} />
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Again</button>
            <button type="button" className="btn btn-primary" onClick={() => onNext(result.overall)}>Next</button>
          </div>
        </section>
      )}
      {!result && !checking && (
        <button type="button" className="link-quiet" onClick={() => onNext(null)}>Skip</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
