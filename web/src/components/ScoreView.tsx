// Per-syllable scores on a green→red scale, an overall score, free tips on tap, optional AI explanation.
import { useState } from 'react'
import type { Syllable } from '../chinese/tokens.ts'
import { scoreColour, tips } from '../scoring/score.ts'
import type { SpeechScore } from '../scoring/speechScore.ts'
import { explainAttempt } from '../services/explain.ts'
import { getKeys } from '../services/keys.ts'

export default function ScoreView({ syllables, result }: { syllables: Syllable[]; result: SpeechScore }) {
  const [open, setOpen] = useState<number | null>(() => {
    const worst = result.syllables.reduce((w, s, i) => (s.score < result.syllables[w].score ? i : w), 0)
    return result.syllables[worst]?.score < 80 ? worst : null
  })
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const openTips = open === null ? [] : tips(syllables[open].pinyin, syllables[open].spoken, result.syllables[open])

  async function explain() {
    setExplaining(true)
    try {
      setExplanation(await explainAttempt(syllables, result.syllables))
    } catch (err) {
      setExplanation(err instanceof Error ? err.message : String(err))
    } finally {
      setExplaining(false)
    }
  }

  return (
    <div className="score-view">
      <p className="score-overall" style={{ color: scoreColour(result.overall) }}>
        {result.overall}
        <span className="score-of">/100</span>
      </p>
      <div className="score-syllables">
        {syllables.map((s, i) => {
          const sc = result.syllables[i]
          return (
            <button key={i} type="button" className="score-syllable" aria-pressed={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className="zh score-hanzi" style={{ color: scoreColour(sc.score) }}>{s.hanzi}</span>
              <span className="score-pinyin">{s.pinyin}</span>
              <span className="score-number" style={{ background: scoreColour(sc.score) }}>{sc.score}</span>
            </button>
          )
        })}
      </div>
      {open !== null && (
        <div className="score-tips fade-in">
          {openTips.length > 0 ? openTips.map((t, i) => <p key={i}>{t}</p>) : <p className="muted">That one sounded right.</p>}
        </div>
      )}
      {getKeys().claude && !explanation && (
        <button type="button" className="link-quiet" onClick={() => void explain()} disabled={explaining}>
          {explaining ? 'Thinking…' : 'Explain in detail'}
        </button>
      )}
      {explanation && <p className="score-explanation">{explanation}</p>}
    </div>
  )
}
