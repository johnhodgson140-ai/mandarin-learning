import { useEffect, useMemo, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { buildParagraph } from '../../chinese/tokens.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import RubyText from '../../components/RubyText.tsx'
import ScoreView from '../../components/ScoreView.tsx'
import { paceRatio, sentences, shadowable } from '../../practice/logic.ts'
import { scoreAndLog } from '../../scoring/attempt.ts'
import type { SpeechScore } from '../../scoring/speechScore.ts'
import { myWords } from '../../services/curriculum.ts'
import { listStories } from '../../services/library.ts'
import { sentencesFor } from '../../services/sentences.ts'
import { nativeSeconds, voicedSeconds } from '../../services/tone.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { deckWords, getLexicon } from '../../services/words.ts'

const SESSION = 8
const segment = (text: string) => [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)].map((s) => s.segment)

/** Example sentences for words I've met, deck sentences and examples, and sentences from my stories, shuffled. */
function pickSentences(mine: string[] = []): string[] {
  const deck = deckWords().flatMap((w) => [/[。？！]/.test(w.hanzi) ? w.hanzi : '', w.example])
  const stories = listStories().flatMap((s) => sentences(s.paragraphs.map((p) => p.join('')).join('')))
  const pool = shadowable([...mine, ...deck, ...stories].filter(Boolean))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, SESSION)
}

export default function Shadow() {
  const [items, setItems] = useState(pickSentences)
  const [index, setIndex] = useState(0)
  const [slow, setSlow] = useState(false)
  const [scores, setScores] = useState<number[]>([])
  // The example sentences for my words load from the app: add them (a beginner has few stories yet).
  const [mine, setMine] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    void sentencesFor(Object.keys(myWords())).then((list) => {
      if (cancelled || list.length === 0) return
      const zh = list.map((e) => e.zh)
      setMine(zh)
      setItems((current) => (index === 0 && scores.length === 0 ? pickSentences(zh) : current))
    })
    return () => {
      cancelled = true
    }
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (items.length === 0)
    return <><a href="#speak" className="back-link">‹ Speak</a><p className="muted">No sentences yet: read a story first.</p></>

  if (index >= items.length) {
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    return (
      <>
        <a href="#speak" className="back-link">‹ Speak</a>
        <h1>Shadowing</h1>
        <section className="card">
          <h2 className="card-title">Done</h2>
          <p>{scores.length} sentences · average {avg}/100</p>
          <div className="sheet-actions">
            <a href="#speak" className="btn btn-secondary link-btn center">Speak</a>
            <button type="button" className="btn btn-primary" onClick={() => { setItems(pickSentences(mine)); setIndex(0); setScores([]) }}>More</button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="reading-progress" style={{ transform: `scaleX(${index / items.length})` }} aria-hidden="true" />
      <header className="mission-bar">
        <a href="#speak" className="back-link">‹ Speak</a>
        <div className="mission-toggles">
          <button type="button" className="chip" aria-pressed={!slow} onClick={() => setSlow(false)}>Normal</button>
          <button type="button" className="chip" aria-pressed={slow} onClick={() => setSlow(true)}>0.8×</button>
        </div>
      </header>
      <h1>Shadowing</h1>
      <p className="muted small">Play the sentence, then say it straight away, matching the rhythm.</p>
      <ShadowItem
        key={index}
        sentence={items[index]}
        rate={slow ? rateForLevel() * 0.8 : rateForLevel()}
        onNext={(score) => {
          setScores([...scores, score])
          setIndex(index + 1)
        }}
      />
    </>
  )
}

function ShadowItem({ sentence, rate, onNext }: { sentence: string; rate: number; onNext: (score: number) => void }) {
  const tokens = useMemo(() => buildParagraph(segment(sentence), getLexicon()), [sentence])
  const syllables = useMemo(() => tokens.flatMap((t) => t.syllables), [tokens])
  const [result, setResult] = useState<{ score: SpeechScore; pace: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      const [score, mine, native] = await Promise.all([
        scoreAndLog(sentence, syllables, rec, 'shadow'),
        voicedSeconds(rec.wav),
        nativeSeconds(sentence, rate),
      ])
      setResult({ score, pace: paceRatio(syllables.length, mine, native, rate) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const paceText = (p: number) => (p >= 0.9 && p <= 1.15 ? 'about native speed' : p < 0.9 ? 'a little slow: try to keep up' : 'a little fast: slow down slightly')

  return (
    <>
      <div className="drill-card tone-colours">
        <RubyText tokens={tokens} className="shadow-text" />
        <button type="button" className="btn btn-secondary" onClick={() => speak(sentence, rate)}>▶ Play</button>
      </div>
      {!result && !checking && <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Scoring…</p>}
      {result && (
        <section className="card fade-in">
          <ScoreView syllables={syllables} result={result.score} />
          <p className="muted">Pace: {result.pace.toFixed(2)}× native, {paceText(result.pace)}.</p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Again</button>
            <button type="button" className="btn btn-primary" onClick={() => onNext(result.score.overall)}>Next</button>
          </div>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
