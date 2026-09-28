import { useEffect, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import ScoreView from '../../components/ScoreView.tsx'
import { scoreAndLog } from '../../scoring/attempt.ts'
import type { SpeechScore } from '../../scoring/speechScore.ts'
import { buildDojo, type DojoItem } from '../../grading/dojo.ts'
import { pairStats } from '../../grading/toneStats.ts'
import { allAttempts } from '../../services/attempts.ts'
import { load } from '../../services/storage.ts'
import { getProfile, nativeContour, toneLabel } from '../../services/tone.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

type Done = { item: DojoItem; clean: boolean }

export default function Dojo() {
  const [items, setItems] = useState<DojoItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState<Done[]>([])

  useEffect(() => {
    let cancelled = false
    allAttempts()
      .catch(() => [])
      .then((attempts) => {
        if (!cancelled) setItems(buildDojo(getLexicon(), pairStats(attempts.flatMap((a) => a.syllables))))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!getProfile())
    return (
      <>
        <Back />
        <h1>Tone Dojo</h1>
        <p className="muted">
          First, <a href="#speak/calibrate">calibrate your voice</a>: four syllables, so the app knows your pitch range.
        </p>
      </>
    )
  if (!items) return <Back />

  if (index >= items.length) {
    const toPractise = [...new Set(done.filter((d) => !d.clean).map((d) => d.item.pair.join('–')))]
    return (
      <>
        <Back />
        <h1>Tone Dojo</h1>
        <section className="card">
          <h2 className="card-title">Drill finished</h2>
          <p>{done.filter((d) => d.clean).length} of {done.length} words clean.</p>
          {toPractise.length > 0 && <p className="muted">Keep practising tone pairs {toPractise.join(', ')}.</p>}
          <div className="sheet-actions">
            <a href="#speak" className="btn btn-secondary link-btn center">Speak</a>
            <button type="button" className="btn btn-primary" onClick={() => { setItems(null); setIndex(0); setDone([]); allAttempts().catch(() => []).then((a) => setItems(buildDojo(getLexicon(), pairStats(a.flatMap((x) => x.syllables))))) }}>
              New drill
            </button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="reading-progress" style={{ transform: `scaleX(${index / items.length})` }} aria-hidden="true" />
      <Back />
      <DojoCard
        key={index}
        item={items[index]}
        onNext={(clean) => {
          setDone([...done, { item: items[index], clean }])
          setIndex(index + 1)
        }}
      />
    </>
  )
}

function Back() {
  return <a href="#speak" className="back-link">‹ Speak</a>
}

function DojoCard({ item, onNext }: { item: DojoItem; onNext: (clean: boolean) => void }) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<SpeechScore | null>(null)
  const [native, setNative] = useState<number[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rate = rateForLevel(load('level', 1))
  const syllables = item.token.syllables
  const toneChange = syllables.some((s) => s.spoken !== s.written)

  useEffect(() => {
    let cancelled = false
    nativeContour(item.word).then((c) => !cancelled && setNative(c), () => {})
    return () => {
      cancelled = true
    }
  }, [item.word])

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      const r = await scoreAndLog(item.word, syllables, rec, 'dojo')
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
        <p className="drill-hanzi zh">
          {syllables.map((s, i) => (
            <span key={i}>{s.hanzi}</span>
          ))}
        </p>
        <p className="drill-pinyin">
          {syllables.map((s, i) => <span key={i} className={`t${s.written}`}>{s.pinyin}</span>)}
        </p>
        {toneChange && (
          <p className="muted small">
            Tone change: say it as {syllables.map((s) => toneLabel(s.spoken)).join(' + ')}.
          </p>
        )}
        {item.token.gloss && <p className="muted">{item.token.gloss}</p>}
        <button type="button" className="btn btn-secondary" onClick={() => speak(item.word, rate)}>▶ Hear it</button>
      </div>

      {!result && !checking && <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Checking…</p>}

      {result && (
        <section className="card fade-in">
          <ScoreView syllables={syllables} result={result} native={native} />
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Again</button>
            <button type="button" className="btn btn-primary" onClick={() => onNext(result.overall >= 80)}>Next</button>
          </div>
        </section>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
