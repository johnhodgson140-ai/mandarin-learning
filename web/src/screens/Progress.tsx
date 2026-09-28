import { useEffect, useMemo, useState } from 'react'
import type { Recording } from '../audio/recorder.ts'
import { buildParagraph } from '../chinese/tokens.ts'
import HoldToTalk from '../components/HoldToTalk.tsx'
import RubyText from '../components/RubyText.tsx'
import ToneHeatmap from '../components/ToneHeatmap.tsx'
import { pairStats } from '../grading/toneStats.ts'
import { activeDays, estimateHsk, minutesThisWeek, streak, totalXp } from '../progress/logic.ts'
import { scoreAndLog } from '../scoring/attempt.ts'
import { type Attempt } from '../services/attempts.ts'
import { idbGet, idbPut } from '../services/idb.ts'
import { gatherActivity } from '../services/progress.ts'
import { load, save } from '../services/storage.ts'
import { getLexicon, knownWords } from '../services/words.ts'
import './Progress.css'

/** The same passage every month, so recordings can be compared. */
const BENCHMARK = ['你好', '！', '我', '是', '英国人', '，', '我', '在', '大学', '学习', '。', '我', '正在', '学', '中文', '，', '我', '觉得', '中文', '很', '有意思', '。', '周末', '我', '喜欢', '和', '朋友', '一起', '去', '看', '足球', '比赛', '。']

type Bench = { month: string; score: number }
const monthKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 7)

export default function Progress() {
  const [data, setData] = useState<Awaited<ReturnType<typeof gatherActivity>> | null>(null)
  useEffect(() => {
    gatherActivity().then(setData, () => {})
  }, [])
  const lexicon = getLexicon()
  const known = knownWords(lexicon).length
  const stats = useMemo(() => pairStats((data?.attempts ?? []).flatMap((a: Attempt) => a.syllables)), [data])

  if (!data) return <h1>Progress</h1>
  const s = streak(activeDays(data.activity))
  return (
    <>
      <h1>Progress</h1>
      <dl className="stat-tiles">
        <div><dt>Words known</dt><dd>{known}</dd><span className="muted small">{lexicon.size} in your deck</span></div>
        <div><dt>Est. HSK</dt><dd>{estimateHsk(known) || '–'}</dd><span className="muted small">from words known</span></div>
        <div><dt>Minutes spoken</dt><dd>{minutesThisWeek(data.activity)}</dd><span className="muted small">this week</span></div>
        <div><dt>Streak</dt><dd>{s.days}</dd><span className="muted small">{s.freezesLeft} freeze{s.freezesLeft === 1 ? '' : 's'} left · {totalXp(data.activity)} XP</span></div>
      </dl>

      <section className="card">
        <h2 className="card-title">Tone pairs</h2>
        <ToneHeatmap stats={stats} />
      </section>

      <Benchmark />
    </>
  )
}

function Benchmark() {
  const tokens = useMemo(() => buildParagraph(BENCHMARK, getLexicon()), [])
  const syllables = useMemo(() => tokens.flatMap((t) => t.syllables), [tokens])
  const [history, setHistory] = useState<Bench[]>(() => load<Bench[]>('benchmarks', []))
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const thisMonth = history.find((b) => b.month === monthKey())

  async function recorded(rec: Recording) {
    setChecking(true)
    setError(null)
    try {
      const result = await scoreAndLog(BENCHMARK.join(''), syllables, rec, 'read')
      await idbPut('recordings', { id: `bench-${monthKey()}`, wav: rec.wav, createdAt: Date.now() })
      const next = [...history.filter((b) => b.month !== monthKey()), { month: monthKey(), score: result.overall }].sort((a, b) => a.month.localeCompare(b.month))
      setHistory(next)
      save('benchmarks', next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  async function play(month: string) {
    const r = await idbGet<{ wav: Blob }>('recordings', `bench-${month}`)
    if (!r) return
    const url = URL.createObjectURL(r.wav)
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    void audio.play()
  }

  return (
    <section className="card">
      <h2 className="card-title">Monthly benchmark</h2>
      <p className="muted small">Read the same passage once a month and hear how far you've come.</p>
      <RubyText tokens={tokens} className="correction-better" />
      {!thisMonth && !checking && <HoldToTalk listen onRecorded={(r) => void recorded(r)} onError={setError} />}
      {checking && <p className="muted" role="status">Scoring…</p>}
      {thisMonth && <p className="muted small">This month is recorded. Come back next month.</p>}
      {history.length > 0 && (
        <ul className="bench-list">
          {history.map((b) => (
            <li key={b.month}>
              <span>{new Date(`${b.month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
              <span className="bench-score">{b.score}/100</span>
              <button type="button" className="link-quiet" onClick={() => void play(b.month)}>▶ Play</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
