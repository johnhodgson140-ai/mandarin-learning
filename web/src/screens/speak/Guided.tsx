import { useEffect, useMemo, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { buildParagraph, type Syllable } from '../../chinese/tokens.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import RubyText from '../../components/RubyText.tsx'
import ScoreView from '../../components/ScoreView.tsx'
import type { GuidedMission, GuidedStep } from '../../daily/schema.ts'
import { scoreAndLog } from '../../scoring/attempt.ts'
import { scoreSpeech, type SpeechScore } from '../../scoring/speechScore.ts'
import { guidedMission } from '../../services/daily.ts'
import { load, save } from '../../services/storage.ts'
import { packMission } from '../../services/pack.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

const segment = (text: string) => [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(text)].map((s) => s.segment)
const tokensOf = (text: string) => buildParagraph(segment(text), getLexicon())

export default function Guided({ id }: { id: string }) {
  // Today's missions are cached; pack missions load from the pack file.
  const [mission, setMission] = useState<GuidedMission | null | undefined>(() => guidedMission(id))
  useEffect(() => {
    if (mission === undefined) packMission(id).then((m) => setMission(m ?? null), () => setMission(null))
  }, [id, mission])
  const [step, setStep] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const [hideText, setHideText] = useState(false)
  if (mission === undefined) return <p className="muted">Loading…</p>
  if (!mission) return <><a href="#speak/missions" className="back-link">‹ Missions</a><p className="muted">This mission isn't available any more.</p></>

  const done = step >= mission.steps.length
  return (
    <>
      <header className="mission-bar">
        <a href="#speak/missions" className="back-link">‹ Missions</a>
        <div className="mission-toggles">
          <button type="button" className="chip" aria-pressed={hideText} onClick={() => setHideText(!hideText)}>Hide text</button>
        </div>
      </header>
      <h1>{mission.title}</h1>
      <p className="muted">Goal: {mission.goal}</p>
      {done ? (
        <Closing mission={mission} scores={scores} hideText={hideText} />
      ) : (
        <StepView
          key={step}
          mission={mission}
          step={mission.steps[step]}
          hideText={hideText}
          onNext={(score) => {
            setScores([...scores, score])
            setStep(step + 1)
          }}
        />
      )}
      <div className="reading-progress" style={{ transform: `scaleX(${step / mission.steps.length})` }} aria-hidden="true" />
    </>
  )
}

function PartnerLine({ zh, en, role, hideText, level }: { zh: string; en: string; role: string; hideText: boolean; level: number }) {
  const [english, setEnglish] = useState(true)
  const tokens = useMemo(() => tokensOf(zh), [zh])
  useEffect(() => void speak(zh, rateForLevel(level)), [zh, level])
  return (
    <div className="turn">
      <RubyText tokens={tokensOf(role)} className="turn-label" />
      {hideText ? <span className="muted">Text hidden: listen.</span> : (
        <button type="button" className="turn-text-btn" onClick={() => setEnglish(!english)} aria-expanded={english}>
          <RubyText tokens={tokens} className="turn-text" />
        </button>
      )}
      {english && !hideText && <span className="muted">{en}</span>}
      <button type="button" className="link-quiet" onClick={() => speak(zh, rateForLevel(level))}>▶ Replay</button>
    </div>
  )
}

function StepView({ mission, step, hideText, onNext }: { mission: GuidedMission; step: GuidedStep; hideText: boolean; onNext: (score: number) => void }) {
  const [showAnswers, setShowAnswers] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ answer: string; english: string; syllables: Syllable[]; score: SpeechScore } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answers = useMemo(
    () => step.answers_zh.map((a, i) => ({ answer: a, english: step.answers_en?.[i] ?? '', syllables: tokensOf(a).flatMap((t) => t.syllables) })),
    [step],
  )

  async function grade(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      // Pick the example answer closest to what I said (free scorer), then score and log that one.
      let best = answers[0]
      if (rec.heard?.length && answers.length > 1) {
        let top = -1
        for (const a of answers) {
          const s = await scoreSpeech(a.syllables, rec)
          if (s.overall > top) {
            top = s.overall
            best = a
          }
        }
      }
      const score = await scoreAndLog(best.answer, best.syllables, rec, 'mission')
      setResult({ ...best, score })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <PartnerLine zh={step.partner_zh} en={step.partner_en} role={mission.role} hideText={hideText} level={mission.level} />
      <section className="card">
        <p><strong>Your turn:</strong> {step.prompt_en}</p>
        {!result && (
          <button type="button" className="link-quiet" onClick={() => setShowAnswers(!showAnswers)}>
            {showAnswers ? 'Hide examples' : 'Show example answers'}
          </button>
        )}
        {showAnswers && !result && (
          <ul className="corrections">
            {answers.map((a) => (
              <li key={a.answer}>
                <RubyText tokens={tokensOf(a.answer)} className="correction-better" />
                {a.english && <span className="muted small answer-en">{a.english}</span>}
              </li>
            ))}
          </ul>
        )}
        {result && (
          <>
            <p className="muted small">Closest answer{result.english ? `: “${result.english}”` : ':'}</p>
            <ScoreView syllables={result.syllables} result={result.score} />
            <div className="sheet-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setResult(null)}>Again</button>
              <button type="button" className="btn btn-primary" onClick={() => onNext(result.score.overall)}>Next</button>
            </div>
          </>
        )}
      </section>
      {!result && !checking && <HoldToTalk listen onRecorded={(r) => void grade(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Scoring…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}

function Closing({ mission, scores, hideText }: { mission: GuidedMission; scores: number[]; hideText: boolean }) {
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  useEffect(() => {
    const done = load<string[]>('guidedDone', [])
    if (!done.includes(mission.id)) save('guidedDone', [...done, mission.id])
  }, [mission.id])
  return (
    <>
      <PartnerLine zh={mission.closing_zh} en={mission.closing_en} role={mission.role} hideText={hideText} level={mission.level} />
      <section className="card">
        <h2 className="card-title">Mission complete</h2>
        <p>{scores.length} replies · average {avg}/100</p>
        <a href="#speak/missions" className="btn btn-primary link-btn center">Back to missions</a>
      </section>
    </>
  )
}
