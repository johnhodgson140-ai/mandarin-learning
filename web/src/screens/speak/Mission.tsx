import { useEffect, useMemo, useRef, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { buildParagraph } from '../../chinese/tokens.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import RubyText from '../../components/RubyText.tsx'
import { pronunciationSummary, scenarioById, type Session, type Turn } from '../../missions/logic.ts'
import { addCard } from '../../services/anki.ts'
import { assess } from '../../services/azure.ts'
import { canRecognise } from '../../scoring/recognize.ts'
import { scoreSpeech } from '../../scoring/speechScore.ts'
import { getKeys } from '../../services/keys.ts'
import { finishSession, sendTurn, startSession } from '../../services/missions.ts'
import { load, save } from '../../services/storage.ts'
import { passesBoss } from '../../progress/logic.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

export default function Mission({ scenarioId }: { scenarioId: string }) {
  const scenario = scenarioById(scenarioId)
  const hasClaude = Boolean(getKeys().claude)
  const hasAzure = Boolean(getKeys().azure)
  // Without Azure, the phone's own recogniser writes down what I said and my tone model scores it.
  const canSpeak = hasAzure || canRecognise()
  const [session, setSession] = useState<Session | null>(null)
  const [busy, setBusy] = useState<string | null>(() => (scenario && hasClaude ? 'Starting…' : null))
  const [error, setError] = useState<string | null>(null)
  const [hideText, setHideText] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [level] = useState(() => load('missionLevel', load('level', 1)))
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scenario || !hasClaude) return
    let cancelled = false
    startSession(scenario.id, level).then(
      (s) => {
        if (cancelled) return
        setSession(s)
        setBusy(null)
        void speak(s.turns[0].zh, rateForLevel(level))
      },
      (err: unknown) => {
        if (cancelled) return
        setBusy(null)
        setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [scenario, hasClaude, level])

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [session?.turns.length, busy])

  if (!scenario) return <p className="muted">Unknown mission.</p>

  async function reply(mine: Extract<Turn, { role: 'me' }>) {
    if (!session) return
    setBusy('…')
    setShowHint(false)
    setError(null)
    try {
      const next = await sendTurn(session, mine)
      setSession(next)
      void speak(next.turns[next.turns.length - 1].zh, rateForLevel(level))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function spoken(rec: Recording) {
    setBusy('Listening…')
    setError(null)
    try {
      if (!hasAzure) {
        const text = rec.heard?.[0]?.trim() ?? ''
        if (!text) {
          setBusy(null)
          setError("Didn't catch that. Try again, a little louder, or type instead.")
          return
        }
        await reply({ role: 'me', zh: text, pron: await phonePron(text, rec) })
        return
      }
      const heard = await assess(rec.wav, '')
      if (!heard.text.trim()) {
        setBusy(null)
        setError("Didn't catch that. Try again, a little louder.")
        return
      }
      await reply({
        role: 'me',
        zh: heard.text.trim(),
        pron: {
          accuracy: heard.words.length ? Math.round(heard.words.reduce((sum, w) => sum + w.accuracy, 0) / heard.words.length) : 0,
          fluency: heard.fluency,
          words: heard.words.map((w) => ({ word: w.word, accuracy: w.accuracy })),
        },
      })
    } catch (err) {
      setBusy(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function finish() {
    if (!session) return
    setBusy('Writing your report…')
    setError(null)
    try {
      setSession(await finishSession(session))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const lastHint = [...(session?.turns ?? [])].reverse().find((t) => t.role === 'partner')
  const myTurns = session?.turns.filter((t) => t.role === 'me').length ?? 0

  if (session?.report) return <ReportView session={session} />

  return (
    <>
      <header className="mission-bar">
        <a href={scenario.id === 'free' ? '#speak' : '#speak/missions'} className="back-link">‹ {scenario.id === 'free' ? 'Speak' : 'Missions'}</a>
        <div className="mission-toggles">
          <button type="button" className="chip" aria-pressed={hideText} onClick={() => setHideText(!hideText)}>Hide text</button>
          <button type="button" className="chip" aria-pressed={showHint} onClick={() => setShowHint(!showHint)} disabled={!lastHint}>Hint</button>
        </div>
      </header>
      <h1>{scenario.title}</h1>
      {scenario.goal && <p className="muted">Goal: {scenario.goal}</p>}
      {!hasClaude && <p className="muted">Add your Claude API key in <a href="#settings">Settings</a> first.</p>}

      <ol className="transcript">
        {session?.turns.map((t, i) => <TurnLine key={i} turn={t} role={scenario.role} hideText={hideText} level={level} />)}
      </ol>

      {showHint && lastHint?.role === 'partner' && <p className="hint">You could say: {lastHint.hint}</p>}
      {session?.goalAchieved && <p className="muted">Goal reached. Finish when you're ready.</p>}
      {busy && <p className="muted" role="status">{busy}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {session && !busy && (
        <div className="mission-input">
          {canSpeak && !typing && <HoldToTalk listen={!hasAzure} onRecorded={(r) => void spoken(r)} onError={setError} />}
          {(typing || !canSpeak) && (
            <form
              className="type-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (draft.trim()) void reply({ role: 'me', zh: draft.trim(), pron: null })
                setDraft('')
              }}
            >
              <input className="type-input zh" lang="zh-CN" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="用中文回答…" aria-label="Your reply" />
              <button type="submit" className="btn btn-primary">Send</button>
            </form>
          )}
          <div className="sheet-actions">
            {canSpeak && (
              <button type="button" className="btn btn-secondary" onClick={() => setTyping(!typing)}>{typing ? 'Speak instead' : 'Type instead'}</button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => void finish()} disabled={myTurns === 0}>Finish</button>
          </div>
        </div>
      )}
      <div ref={bottom} />
    </>
  )
}

function TurnLine({ turn, role, hideText, level }: { turn: Turn; role: string; hideText: boolean; level: number }) {
  const [english, setEnglish] = useState(true)
  const tokens = useMemo(() => buildParagraph(splitForRuby(turn.zh), getLexicon()), [turn.zh])
  if (turn.role === 'me')
    return (
      <li className="turn turn-me">
        <span className="turn-label">You</span>
        <span className="zh turn-text">{turn.zh}</span>
      </li>
    )
  return (
    <li className="turn">
      <span className="turn-label zh">{role}</span>
      {hideText ? (
        <span className="muted">Text hidden: listen.</span>
      ) : (
        <button type="button" className="turn-text-btn" onClick={() => setEnglish(!english)} aria-expanded={english}>
          <RubyText tokens={tokens} className="turn-text" />
        </button>
      )}
      {english && !hideText && <span className="muted">{turn.en}</span>}
      <button type="button" className="link-quiet" onClick={() => speak(turn.zh, rateForLevel(level))}>▶ Replay</button>
    </li>
  )
}

/** Claude's replies come as plain text: split them the way the browser segments Chinese, then merge Anki words. */
/**
 * No Azure: score the tones of what the phone heard me say (per word, 1–100). Sounds can't be checked here,
 * since the recogniser's own transcript is the reference. Null until my voice is calibrated.
 */
async function phonePron(text: string, rec: Recording): Promise<Extract<Turn, { role: 'me' }>['pron']> {
  const tokens = buildParagraph(splitForRuby(text), getLexicon()).filter((t) => t.syllables.length > 0)
  const syllables = tokens.flatMap((t) => t.syllables)
  if (syllables.length === 0) return null
  const result = await scoreSpeech(syllables, { wav: rec.wav, seconds: rec.seconds })
  if (result.tones.every((t) => t === null)) return null
  let i = 0
  const words = tokens.map((t) => {
    const scores = result.syllables.slice(i, (i += t.syllables.length)).map((s) => s.score)
    return { word: t.text, accuracy: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }
  })
  return { accuracy: result.overall, fluency: null, words }
}

function splitForRuby(text: string): string[] {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  return [...segmenter.segment(text)].map((s) => s.segment)
}

function ReportView({ session }: { session: Session }) {
  const scenario = scenarioById(session.scenario)!
  const report = session.report!
  const pron = pronunciationSummary(session.turns)
  const lexicon = getLexicon()
  const [levelUp] = useState(() => {
    const mine = load('level', 1)
    if (!passesBoss(session.level, mine, report.goal_achieved, pron?.accuracy ?? null)) return null
    save('level', session.level)
    return session.level
  })
  return (
    <>
      <a href={scenario.id === 'free' ? '#speak' : '#speak/missions'} className="back-link">‹ {scenario.id === 'free' ? 'Speak' : 'Missions'}</a>
      <h1>{scenario.title}: report</h1>
      {levelUp && (
        <section className="card level-up">
          <h2 className="card-title">Level {levelUp}</h2>
          <p>You passed a mission at the next level with clear pronunciation. You're now level {levelUp}.</p>
        </section>
      )}
      <section className="card">
        {scenario.goal && <p>{report.goal_achieved ? 'Goal achieved.' : 'Goal not reached this time.'}</p>}
        <p className="muted">{report.summary_en}</p>
      </section>

      {report.corrections.length > 0 && (
        <section className="card">
          <h2 className="card-title">Corrections</h2>
          <ul className="corrections">
            {report.corrections.map((c, i) => (
              <li key={i}>
                <span className="zh muted">{c.mine}</span>
                <RubyText tokens={buildParagraph(splitForRuby(c.better), lexicon)} className="correction-better" />
                <span className="muted small">{c.why_en}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pron && (
        <section className="card">
          <h2 className="card-title">Pronunciation</h2>
          <dl className="counts counts-3">
            <div><dt>Accuracy</dt><dd>{pron.accuracy}</dd></div>
            <div><dt>Fluency</dt><dd>{pron.fluency ?? '–'}</dd></div>
          </dl>
          {pron.practise.length > 0 && <p className="muted">Words to practise: <span className="zh">{pron.practise.join('、')}</span></p>}
        </section>
      )}

      {report.new_words.length > 0 && (
        <section className="card">
          <h2 className="card-title">New words</h2>
          <ul className="new-words">
            {report.new_words.map((w) => <NewWord key={w.word} word={w.word} english={w.english} />)}
          </ul>
        </section>
      )}
    </>
  )
}

function NewWord({ word, english }: { word: string; english: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const [token] = useMemo(() => buildParagraph([word], getLexicon()), [word])
  const canAdd = true
  async function add() {
    try {
      const r = await addCard({ hanzi: word, pinyin: token.syllables.map((s) => s.pinyin), english })
      setStatus(r === 'added' ? 'Added' : r === 'duplicate' ? 'Already in Anki' : 'Saved for export')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <li className="new-word">
      <span>
        <RubyText tokens={[token]} /> <span className="muted">{english}</span>
      </span>
      {status ? <span className="muted small">{status}</span> : (
        <button type="button" className="btn btn-secondary" onClick={() => void add()} disabled={!canAdd}>+ Anki</button>
      )}
    </li>
  )
}
