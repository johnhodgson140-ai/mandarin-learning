import { useEffect, useMemo, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { daysUntil, nextState, type Card } from '../../cards/srs.ts'
import { tokensOfText } from '../../chinese/tokens.ts'
import { hskLabel, loadHsk, type HskInfo } from '../../services/hsk.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import PlayButton from '../../components/PlayButton.tsx'
import ScoreView from '../../components/ScoreView.tsx'
import { canRecognise } from '../../scoring/recognize.ts'
import { scoreAndLog } from '../../scoring/attempt.ts'
import type { SpeechScore } from '../../scoring/speechScore.ts'
import { cardStates, dueCounts, keepSession, learnOrder, newSession, recordCard, resumeSession, type CardMode } from '../../services/cards.ts'
import { load, save } from '../../services/storage.ts'
import { getProfile } from '../../services/tone.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

const MODES: { mode: CardMode; label: string; hint: string }[] = [
  { mode: 'learn', label: 'Learn', hint: '中 → English: see the characters, say them.' },
  { mode: 'recall', label: 'Recall', hint: 'English → 中: say it from memory.' },
]

/** The mode I used last ('read'/'recall' before the modes were renamed). */
function lastMode(): CardMode {
  const saved = load<string>('cardMode', 'learn')
  return saved === 'recall' ? 'recall' : 'learn'
}

export default function Cards() {
  const [mode, setMode] = useState<CardMode>(lastMode)
  const [{ cards: session, index, scores }, setRun] = useState(() => resumeSession(mode))
  const [counts, setCounts] = useState(dueCounts)
  const canScore = canRecognise() || getProfile() !== null

  const update = (cards: Card[], i: number, sc: number[]) => {
    setRun({ cards, index: i, scores: sc })
    keepSession(mode, cards, i, sc)
  }
  const chooseMode = (m: CardMode) => {
    if (m === mode) return
    keepSession(mode, session, index, scores)
    setMode(m)
    save('cardMode', m)
    setRun(resumeSession(m))
  }

  const toggles = (
    <div className="mission-toggles" role="group" aria-label="Card mode">
      {MODES.map((m) => (
        <button key={m.mode} type="button" className="chip" aria-pressed={mode === m.mode} onClick={() => chooseMode(m.mode)}>
          {m.label}{counts[m.mode] > 0 && ` · ${counts[m.mode]}`}
        </button>
      ))}
    </div>
  )
  const hint = <p className="muted small">{MODES.find((m) => m.mode === mode)!.hint}</p>

  if (index >= session.length) {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const empty =
      mode === 'recall'
        ? learnOrder().length === 0
          ? 'Words unlock here after you’ve done them in Learn.'
          : 'You’ve caught up with Learn. Do more words there to unlock more here.'
        : 'Nothing due right now.'
    return (
      <>
        <header className="mission-bar">
          <a href="#speak" className="back-link">‹ Speak</a>
          {toggles}
        </header>
        <h1>Say your cards</h1>
        {hint}
        <section className="card">
          <h2 className="card-title">{session.length ? 'Session done' : empty}</h2>
          {session.length > 0 && <p>{scores.length} cards · average {avg}/100</p>}
          <div className="sheet-actions">
            <a href="#speak" className="btn btn-secondary link-btn center">Speak</a>
            <button type="button" className="btn btn-primary" onClick={() => update(newSession(mode, 6), 0, [])}>
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
        {toggles}
      </header>
      {hint}
      {!canScore && (
        <p className="muted small">
          This browser has no speech recogniser: <a href="#speak/calibrate">calibrate your voice</a> so tones can still be scored.
        </p>
      )}
      <CardView
        key={`${mode}-${index}-${session[index].hanzi}`}
        card={session[index]}
        mode={mode}
        onNext={(score) => {
          let next = session
          let nextScores = scores
          if (score !== null) {
            const card = session[index]
            recordCard(card.hanzi, score, mode)
            nextScores = [...scores, score]
            // Forgotten ("again"): once more at the end of this session.
            if (score < 60 && session.filter((c) => c.hanzi === card.hanzi).length === 1) next = [...session, card]
            setCounts(dueCounts())
          }
          update(next, index + 1, nextScores)
        }}
      />
    </>
  )
}

function CardView({ card, mode, onNext }: { card: Card; mode: CardMode; onNext: (score: number | null) => void }) {
  // Split into words first: a sentence card (我会说一点儿中文) reads each word properly.
  const syllables = useMemo(() => tokensOfText(card.hanzi, getLexicon()).flatMap((t) => t.syllables), [card.hanzi])
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
  const [shown, setShown] = useState(false)
  // The first scored try is what goes into the schedule; "Try again" is practice.
  const [first, setFirst] = useState<number | null>(null)
  const rate = rateForLevel(load('level', 1))
  const revealed = mode === 'learn' || result !== null || shown

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      const r = await scoreAndLog(card.hanzi, syllables, rec, 'card')
      if (scored(r)) setFirst((f) => (f === null ? (shown ? 0 : r.overall) : f))
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
            {syllables.map((s, i) => <span key={i} className={`t${s.written}`}>{s.pinyin}</span>)}
          </p>
        )}
        {revealed && card.english && <p className="muted">{card.english}</p>}
        <span className="muted small">
          {card.source === 'anki' ? 'Anki' : card.source === 'app' ? 'Starter words' : card.source === 'story' ? 'From a story' : 'From a mission'}
          {hsk && ` · ${hskLabel(hsk.level)}`}
        </span>
        {revealed && (
          <PlayButton id={`card-${card.hanzi}`} label="Hear it" className="btn btn-secondary" start={() => speak(card.hanzi, rate, `card-${card.hanzi}`)} />
        )}
      </div>

      {!result && !checking && <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Scoring…</p>}
      {result && (
        <section className="card fade-in">
          <ScoreView syllables={syllables} result={result} />
          <p className="muted small">
            {first !== null
              ? nextReviewText(card.hanzi, first, mode, first !== result.overall || shown)
              : 'Nothing could be checked, so this one doesn\u2019t count.'}
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Try again</button>
            <button type="button" className="btn btn-primary" onClick={() => onNext(first)}>Next</button>
          </div>
        </section>
      )}
      {!result && !checking && (
        <div className="sheet-actions">
          {mode === 'recall' && !shown && (
            <button type="button" className="link-quiet" onClick={() => setShown(true)}>Show answer</button>
          )}
          {shown && first === null ? (
            <button type="button" className="btn btn-primary" onClick={() => onNext(0)}>Next</button>
          ) : (
            <button type="button" className="link-quiet" onClick={() => onNext(first)}>{first === null ? 'Skip' : 'Next'}</button>
          )}
        </div>
      )}
      {shown && first === null && !result && (
        <p className="muted small">Shown, so it counts as forgotten and comes back soon. You can still say it for practice.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}

/** What FSRS will do with this card at this score (a preview; it's saved on Next). */
function nextReviewText(hanzi: string, score: number, mode: CardMode, practice: boolean): string {
  const days = daysUntil(nextState(cardStates(mode)[hanzi], score))
  const when = days === 0 ? 'Comes back at the end of this session.' : `Next review in ${days} day${days === 1 ? '' : 's'}.`
  return practice ? `${when} (Your first try, ${score}, is the one that counts.)` : when
}

/** Did anything get checked? (Not before my voice is known and with no sound checker: then don't schedule.) */
const scored = (r: SpeechScore) => r.syllables.some((s) => s.checked)
