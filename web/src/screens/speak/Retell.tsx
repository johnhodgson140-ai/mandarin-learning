import { useMemo, useState } from 'react'
import type { Recording } from '../../audio/recorder.ts'
import { buildParagraph, pinyinOfText } from '../../chinese/tokens.ts'
import { toneless } from '../../chinese/tones.ts'
import HoldToTalk from '../../components/HoldToTalk.tsx'
import RubyText from '../../components/RubyText.tsx'
import { coverage, keyWords } from '../../practice/logic.ts'
import { assess } from '../../services/azure.ts'
import { cachedDaily } from '../../services/daily.ts'
import { getKeys } from '../../services/keys.ts'
import { listStories } from '../../services/library.ts'
import { retellFeedback, type RetellFeedback } from '../../services/retell.ts'
import { load } from '../../services/storage.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

/** A 60–140 character piece: today's daily story first, else my newest story. */
function pickStory(): { words: string[]; names: string[]; title: string } | null {
  const daily = cachedDaily()?.stories[0]
  const story = daily
    ? { paragraphs: daily.paragraphs, names: daily.names, title: daily.title_zh }
    : (() => {
        const s = listStories()[0]
        return s ? { paragraphs: s.paragraphs, names: s.names, title: s.titleZh } : null
      })()
  if (!story) return null
  const words: string[] = []
  for (const p of story.paragraphs) {
    if (words.join('').length >= 60 && words.join('').length + p.join('').length > 140) break
    words.push(...p)
  }
  return { words, names: story.names, title: story.title }
}

type Heard = { text: string; accuracy: number | null; fluency: number | null }

export default function Retell() {
  const [story] = useState(pickStory)
  const tokens = useMemo(() => (story ? buildParagraph(story.words, getLexicon(), new Set(story.names)) : []), [story])
  const text = story?.words.join('') ?? ''
  const keys = useMemo(() => keyWords(tokens).map((w) => ({ word: w, pinyin: tokens.find((t) => t.text === w)!.syllables.map((s) => s.pinyin) })), [tokens])
  const level = load('level', 1)
  const [plays, setPlays] = useState(0)
  const [heard, setHeard] = useState<Heard | null>(null)
  const [checking, setChecking] = useState(false)
  const [feedback, setFeedback] = useState<RetellFeedback | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!story) return <><a href="#speak" className="back-link">‹ Speak</a><p className="muted">No story to retell yet.</p></>

  async function retold(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      if (getKeys().azure) {
        const a = await assess(rec.wav, '')
        const acc = a.words.length ? Math.round(a.words.reduce((s, w) => s + w.accuracy, 0) / a.words.length) : null
        setHeard({ text: a.text, accuracy: acc, fluency: Math.round(a.fluency) })
      } else if (rec.heard?.length) setHeard({ text: rec.heard[0], accuracy: null, fluency: null })
      else setError("Couldn't hear the retelling. This browser may not support speech recognition: an Azure key (Settings) fixes that.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  async function ask() {
    if (!heard) return
    setAsking(true)
    try {
      setFeedback(await retellFeedback(text, heard.text, level))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAsking(false)
    }
  }

  const said = heard ? (pinyinOfText([...heard.text].filter((c) => /\p{Script=Han}/u.test(c)).join('')).map(toneless)) : []
  const cov = heard ? coverage(keys, said) : null

  return (
    <>
      <a href="#speak" className="back-link">‹ Speak</a>
      <h1>Retell</h1>
      {!heard && (
        <>
          <p className="muted">Listen to the story twice, then tell it back in your own words. Simple sentences are fine.</p>
          <div className="drill-card">
            <button type="button" className="btn btn-primary" onClick={() => { void speak(text, rateForLevel(level)); setPlays(plays + 1) }}>
              ▶ Listen {plays < 2 ? `(${plays + 1} of 2)` : 'again'}
            </button>
          </div>
          {plays >= 1 && !checking && <HoldToTalk listen={!getKeys().azure} onRecorded={(r) => void retold(r)} onError={setError} />}
          {checking && <p className="muted" role="status">Listening back…</p>}
        </>
      )}
      {heard && cov && (
        <>
          <section className="card">
            <h2 className="card-title">You covered {cov.covered.length} of {keys.length} key words</h2>
            <div className="chips">
              {cov.covered.map((w) => <span key={w} className="chip key-chip covered zh">{w}</span>)}
              {cov.missed.map((w) => <span key={w} className="chip key-chip missed zh">{w}</span>)}
            </div>
            <p className="muted small">What I heard: <span className="zh">{heard.text || '(nothing)'}</span></p>
            {heard.accuracy !== null && <p className="muted small">Pronunciation {heard.accuracy} · fluency {heard.fluency}</p>}
            {getKeys().claude && !feedback && (
              <button type="button" className="link-quiet" onClick={() => void ask()} disabled={asking}>{asking ? 'Thinking…' : 'Detailed feedback'}</button>
            )}
          </section>
          {feedback && (
            <section className="card fade-in">
              <h2 className="card-title">Content {feedback.content_score}/100</h2>
              <p className="muted">{feedback.summary_en}</p>
              {feedback.grammar_notes.map((n, i) => <p key={i} className="small">{n}</p>)}
              <RubyText tokens={buildParagraph([...new Intl.Segmenter('zh', { granularity: 'word' }).segment(feedback.better_version_zh)].map((s) => s.segment), getLexicon())} className="correction-better" />
            </section>
          )}
          <section className="card">
            <h2 className="card-title zh">{story.title}</h2>
            <RubyText tokens={tokens} className="correction-better" />
          </section>
          <button type="button" className="btn btn-secondary" onClick={() => { setHeard(null); setFeedback(null); setPlays(0) }}>Try again</button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
