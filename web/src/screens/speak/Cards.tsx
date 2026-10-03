import { useEffect, useMemo, useRef, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { ratingFor, shuffleRest, type Card, type Rating } from '../../cards/srs.ts'
import { tokensOfText } from '../../chinese/tokens.ts'
import { hskLabel, loadHsk, type HskInfo } from '../../services/hsk.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import PlayButton from '../../components/PlayButton.tsx'
import ExampleSentence from '../../components/ExampleSentence.tsx'
import ScoreView from '../../components/ScoreView.tsx'
import { canRecognise } from '../../scoring/recognize.ts'
import { scoreAndLog } from '../../scoring/attempt.ts'
import type { SpeechScore } from '../../scoring/speechScore.ts'
import { bringBackDue, buttonColours, cardStates, COMES_BACK_IN_SESSION, dueCounts, keepSession, learnOrder, newSession, rateCardIn, resumeSession, setTimingMode, timing, timingMode, todaysNewCards, type CardMode, type Run } from '../../services/cards.ts'
import { schedule, whenText, type TimingMode } from '../../cards/timing.ts'
import { moreWordsToday, todaysWords } from '../../services/curriculum.ts'
import { load, save } from '../../services/storage.ts'
import { getProfile } from '../../services/tone.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

const MODES: { mode: CardMode; label: string; hint: string }[] = [
  { mode: 'learn', label: 'Learn', hint: '中 → English: today’s new words and your reviews. Rate a word you already know Easy.' },
  { mode: 'recall', label: 'Recall', hint: 'English → 中: say it from memory. Only words you’ve passed in Learn.' },
  { mode: 'listen', label: 'Listen', hint: 'Hear it → what it means: no characters until you check. Only words you’ve passed in Learn.' },
]

/** The mode I used last ('read'/'recall' before the modes were renamed). */
function lastMode(): CardMode {
  const saved = load<string>('cardMode', 'learn')
  return saved === 'recall' || saved === 'listen' ? saved : 'learn'
}

export default function Cards() {
  const [mode, setMode] = useState<CardMode>(lastMode)
  const [run, setRun] = useState<Run>(() => resumeSession(mode))
  const { cards: session, index, scores, pending } = run
  const [counts, setCounts] = useState(dueCounts)
  const [timingNow, setTimingNow] = useState<TimingMode>(timingMode)
  const canScore = canRecognise() || getProfile() !== null

  const update = (next: Run) => {
    setRun(next)
    keepSession(mode, next)
  }

  // Today's words are worked out once the word list has loaded: make sure every new one is in today's Learn session.
  // (Reads the latest session when the list arrives, so cards rated meanwhile aren't rewound.)
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    if (mode !== 'learn') return
    let cancelled = false
    void todaysWords().then(() => {
      if (cancelled) return
      const now = latest.current
      const ahead = new Set([...now.cards.slice(now.index).map((c) => c.hanzi), ...now.pending])
      const missing = todaysNewCards().filter((c) => !ahead.has(c.hanzi))
      if (missing.length) update({ ...now, cards: [...now.cards, ...missing] })
      setCounts(dueCounts())
    })
    return () => {
      cancelled = true
    }
    // Only when the mode changes or the screen opens; update() itself changes the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Cards waiting to come back (5 minutes, 30 minutes…): once the rest are done, check every few seconds.
  const waiting = index >= session.length && pending.length > 0
  const [, tick] = useState(0)
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => {
      const next = bringBackDue(latest.current, mode)
      if (next !== latest.current) update(next)
      else tick((t) => t + 1) // keeps "next in …" counting down
    }, 5000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, mode])

  async function moreCards() {
    // Learn: 5 more new words today (pulling ahead); Recall and Listen: whatever Learn has unlocked since.
    if (mode === 'learn') await moreWordsToday(5)
    update({ cards: newSession(mode), index: 0, scores: [], pending: [] })
    setCounts(dueCounts())
  }
  const chooseMode = (m: CardMode) => {
    if (m === mode) return
    keepSession(mode, run)
    setMode(m)
    save('cardMode', m)
    setRun(resumeSession(m))
  }
  const chooseTiming = (t: TimingMode) => {
    setTimingNow(t)
    setTimingMode(t)
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
  const timingPicker = (
    <label className="timing-pick">
      <span className="muted small">Comes back</span>
      <select value={timingNow} onChange={(e) => chooseTiming(e.target.value as TimingMode)}>
        {TIMING_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  )
  const left = session.length - index

  if (waiting) {
    const states = cardStates(mode)
    const soonest = Math.min(...pending.map((h) => states[h]?.due ?? Date.now()))
    return (
      <>
        <header className="mission-bar">
          <a href="#speak" className="back-link">‹ Speak</a>
          {toggles}
        </header>
        <h1>Say your cards</h1>
        <section className="card">
          <h2 className="card-title">
            {pending.length} card{pending.length === 1 ? '' : 's'} coming back · next in {whenText(soonest, Date.now())}
          </h2>
          <p className="muted">They’ll appear here when it’s time (keep this open, or come back later today).</p>
          <div className="sheet-actions">
            <a href="#speak" className="btn btn-secondary link-btn center">Speak</a>
            <button type="button" className="btn btn-primary" onClick={() => update(bringBackDue(run, mode, Date.now(), true))}>
              Review now
            </button>
          </div>
        </section>
        {timingPicker}
      </>
    )
  }

  if (index >= session.length) {
    const again = scores.filter((r) => r === 1).length
    const empty =
      mode !== 'learn'
        ? learnOrder().length === 0
          ? 'Words unlock here once you’ve passed them in Learn (Hard or better).'
          : 'You’re in step with Learn. Pass more words there to unlock more here.'
        : 'Nothing due right now: today’s new words and reviews are done.'
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
          {session.length > 0 && <p>{scores.length} cards rated{again > 0 && ` · ${again} marked Again`}</p>}
          <div className="sheet-actions">
            <a href="#speak" className="btn btn-secondary link-btn center">Speak</a>
            <button type="button" className="btn btn-primary" onClick={() => void moreCards()}>
              {mode === 'learn' ? '5 more new words' : 'More cards'}
            </button>
          </div>
        </section>
        {timingPicker}
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
      <div className="cards-bar">
        {hint}
        {left > 1 && (
          <button type="button" className="chip" onClick={() => update({ ...run, cards: shuffleRest(session, index) })} aria-label={`Shuffle the ${left} cards left`}>
            Shuffle
          </button>
        )}
      </div>
      {!canScore && (
        <p className="muted small">
          This browser has no speech recogniser: <a href="#speak/calibrate">calibrate your voice</a> so tones can still be scored.
        </p>
      )}
      <CardView
        key={`${mode}-${index}-${session[index].hanzi}`}
        card={session[index]}
        mode={mode}
        onNext={(rating, score) => {
          let next: Run = { ...run, index: index + 1 }
          if (rating !== null) {
            const card = session[index]
            rateCardIn(mode, card.hanzi, rating, score)
            next.scores = [...scores, rating]
            const due = cardStates(mode)[card.hanzi]?.due ?? 0
            const now = Date.now()
            if (due <= now) {
              // Again in the standard schedule: see it again later this session (up to three times, like Anki's learning steps).
              if (session.filter((c) => c.hanzi === card.hanzi).length < 3) next.cards = [...session, card]
            } else if (due - now <= COMES_BACK_IN_SESSION && !pending.includes(card.hanzi)) {
              // Back in a few minutes or hours: it waits, then slots in when its time comes.
              next.pending = [...pending, card.hanzi]
            }
            setCounts(dueCounts())
          }
          next = bringBackDue(next, mode)
          update(next)
        }}
      />
      {timingPicker}
    </>
  )
}

const TIMING_LABELS: [TimingMode, string][] = [
  ['standard', 'Standard'],
  ['adjusted', 'My multipliers'],
  ['fixed', 'Fixed times'],
]

const SOURCE_LABEL: Record<Card['source'], string> = {
  anki: 'Anki',
  daily: 'Today’s words',
  app: 'Starter words',
  story: 'From a story',
  mission: 'From a mission',
}

const RATINGS: { rating: Rating; label: string }[] = [
  { rating: 1, label: 'Again' },
  { rating: 2, label: 'Hard' },
  { rating: 3, label: 'Good' },
  { rating: 4, label: 'Easy' },
]

/** Anki-style card: the front, then the answer (after "Show answer" or saying it), then I rate myself. */
function CardView({ card, mode, onNext }: { card: Card; mode: CardMode; onNext: (rating: Rating | null, score: number | null) => void }) {
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
  const [revealed, setRevealed] = useState(false)
  const rate = rateForLevel(load('level', 1))
  const score = result && scored(result) ? result.overall : null
  // Saying it before looking suggests a rating; I still choose.
  const suggested = score !== null ? ratingFor(score) : null
  const state = cardStates(mode)[card.hanzi]
  const when = timing()
  // When this card was shown: the button previews are worked out from then.
  const [shownAt] = useState(Date.now)
  const coloured = buttonColours() === 'colour'

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      const r = await scoreAndLog(card.hanzi, syllables, rec, 'card')
      setResult(r)
      setRevealed(true)
      navigator.vibrate?.(r.overall >= 80 ? 10 : [10, 60, 10])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const hear = () => speak(card.hanzi, rate, `card-${card.hanzi}`)
  // Listen: the word plays as the card appears (the tap that brought it up allows the sound).
  useEffect(() => {
    if (mode === 'listen') void speak(card.hanzi, rate, `card-${card.hanzi}`)
  }, [mode, card.hanzi, rate])

  const front =
    mode === 'learn' ? (
      <p className="drill-hanzi zh">{card.hanzi}</p>
    ) : mode === 'recall' ? (
      <p className="drill-english">{card.english || '(no meaning yet)'}</p>
    ) : (
      <div className="drill-listen">
        <PlayButton id={`card-${card.hanzi}`} label="Hear it again" className="btn btn-secondary" start={hear} />
        <p className="muted small">What does it mean?</p>
      </div>
    )

  return (
    <>
      <div className="drill-card tone-colours">
        {front}
        {revealed && (
          <>
            <hr className="card-divider" />
            {mode !== 'learn' && <p className="drill-hanzi zh">{card.hanzi}</p>}
            <p className="drill-pinyin">
              {syllables.map((s, i) => <span key={i} className={`t${s.written}`}>{s.pinyin}</span>)}
            </p>
            {mode !== 'recall' && card.english && <p className="drill-meaning">{card.english}</p>}
            {mode !== 'listen' && <PlayButton id={`card-${card.hanzi}`} label="Hear it" className="btn btn-secondary" start={hear} />}
            <ExampleSentence hanzi={card.hanzi} rate={rate} />
          </>
        )}
        <span className="muted small">
          {SOURCE_LABEL[card.source]}
          {hsk && ` · ${hskLabel(hsk.level)}`}
        </span>
      </div>

      {!revealed && !checking && (
        <>
          <button type="button" className="btn btn-primary show-answer" onClick={() => setRevealed(true)}>Show answer</button>
          {mode !== 'listen' && (
            <>
              <p className="muted small say-first">Or say it first to get a score:</p>
              <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />
            </>
          )}
          <button type="button" className="link-quiet" onClick={() => onNext(null, null)}>Skip</button>
        </>
      )}
      {checking && <p className="muted" role="status">Scoring…</p>}

      {revealed && !checking && (
        <section className="card fade-in">
          <p className="card-title">How well did you know it?</p>
          {suggested && <p id="suggested-note" className="muted small">Filled in: what your score suggests.</p>}
          <div className="rate-row" role="group" aria-label="Rate this card">
            {RATINGS.map(({ rating, label }) => (
              <button
                key={rating}
                type="button"
                className={coloured ? `btn rate-btn rate-${rating}${rating === suggested ? ' suggested' : ''}` : `btn ${rating === suggested ? 'btn-primary' : 'btn-secondary'}`}
                aria-describedby={rating === suggested ? 'suggested-note' : undefined}
                onClick={() => onNext(rating, score)}
              >
                {label}
                <span className="rate-when">{whenText(schedule(state, rating, shownAt, null, when).due, shownAt)}</span>
              </button>
            ))}
          </div>
          {result && !scored(result) && <p className="muted small">Nothing could be checked this time: rate it yourself.</p>}
          {result && <ScoreView syllables={syllables} result={result} />}
          {!result && (
            <details className="muted small">
              <summary>Say it for practice</summary>
              <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />
            </details>
          )}
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}

/** Did anything get checked? (Not before my voice is known and with no sound checker: then don't schedule.) */
const scored = (r: SpeechScore) => r.syllables.some((s) => s.checked)
