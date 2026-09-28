import { useEffect, useMemo, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { daysUntil, nextState, pickSession, type Card } from '../../cards/srs.ts'
import { buildParagraph } from '../../chinese/tokens.ts'
import { hskLabel, loadHsk, type HskInfo } from '../../services/hsk.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import PlayButton from '../../components/PlayButton.tsx'
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
            // Forgotten ("again"): once more at the end of this session.
            const card = session[index]
            if (score < 60 && session.filter((c) => c.hanzi === card.hanzi).length === 1) setSession([...session, card])
          }
          setIndex(index + 1)
        }}
      />
    </>
  )
}

function CardView({ card, mode, onNext }: { card: Card; mode: Mode; onNext: (score: number | null) => void }) {
  const [token] = useMemo(() => buildParagraph([card.hanzi], getLexicon()), [card.hanzi])
  const [hsk, setHsk] = useState<HskInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadHsk().then((d) => !cancelled && setHsk(d.get(card.hanzi) ?? null))
    return () => {
      cancelled = true
    }
  }, [card.hanzi])
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
        {revealed && (
          <p className="drill-pinyin">
            {token.syllables.map((s, i) => <span key={i} className={`t${s.written}`}>{s.pinyin}</span>)}
          </p>
        )}
        {revealed && card.english && <p className="muted">{card.english}</p>}
        <span className="muted small">
          {card.source === 'anki' ? 'Anki' : card.source === 'app' ? 'Starter words' : card.source === 'story' ? 'From a story' : 'From a mission'}
          {hsk && ` · ${hskLabel(hsk.level)}`}
        </span>
        {(mode === 'read' || result) && (
          <PlayButton id={`card-${card.hanzi}`} label="Hear it" className="btn btn-secondary" start={() => speak(card.hanzi, rate, `card-${card.hanzi}`)} />
        )}
      </div>

      {!result && !checking && <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Scoring…</p>}
      {result && (
        <section className="card fade-in">
          <ScoreView syllables={token.syllables} result={result} />
          <p className="muted small">{scored(result) ? nextReviewText(card.hanzi, result.overall) : 'Nothing could be checked, so this one doesn\'t count.'}</p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Again</button>
            <button type="button" className="btn btn-primary" onClick={() => onNext(scored(result) ? result.overall : null)}>Next</button>
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

/** What FSRS will do with this card at this score (a preview; it's saved on Next). */
function nextReviewText(hanzi: string, score: number): string {
  const days = daysUntil(nextState(cardStates()[hanzi], score))
  return days === 0 ? 'Comes back at the end of this session.' : `Next review in ${days} day${days === 1 ? '' : 's'}.`
}

/** Did anything get checked? (Not before my voice is known and with no sound checker: then don't schedule.) */
const scored = (r: SpeechScore) => r.syllables.some((s) => s.checked)
