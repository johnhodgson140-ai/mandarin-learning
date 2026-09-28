// Per-syllable scores on a green→red scale, an overall score, free tips on tap, optional AI explanation.
import { useState } from 'react'
import type { Syllable } from '../chinese/tokens.ts'
import { markTone, toneless } from '../chinese/tones.ts'
import { scoreColour, tips } from '../scoring/score.ts'
import type { SpeechScore } from '../scoring/speechScore.ts'
import { explainAttempt } from '../services/explain.ts'
import { getKeys } from '../services/keys.ts'

export default function ScoreView({ syllables, result }: { syllables: Syllable[]; result: SpeechScore }) {
  const [open, setOpen] = useState<number | null>(() => {
    const checked = result.syllables.map((s, i) => [s, i] as const).filter(([s]) => s.checked)
    const worst = checked.reduce<number | null>((w, [s, i]) => (w === null || s.score < result.syllables[w].score ? i : w), null)
    return worst !== null && result.syllables[worst].score < 80 ? worst : null
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
          const said = saidPinyin(s, sc)
          const colour = sc.checked ? scoreColour(sc.score) : undefined
          return (
            <button key={i} type="button" className="score-syllable" aria-pressed={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className="zh score-hanzi" style={{ color: colour }}>{s.hanzi}</span>
              <span className="score-pinyin">{s.pinyin}</span>
              {said && <span className="score-said" style={{ color: said === markTone(toneless(s.pinyin), s.spoken) ? undefined : colour }}>said {said}</span>}
              <span className="score-parts">
                tone {sc.tone === null ? '–' : Math.round(sc.tone * 100)}
                <br />
                sound {sc.sound === null ? '–' : Math.round(sc.sound)}
              </span>
              <span className={`score-number${sc.checked ? '' : ' score-unchecked'}`} style={{ background: colour }}>{sc.checked ? sc.score : '–'}</span>
            </button>
          )
        })}
      </div>
      {result.tones.every((t) => t === null) && (
        <p className="muted small">
          Tones weren't checked yet: the app is still learning your voice (about 5 recordings), or <a href="#speak/calibrate">calibrate now</a> (30 s).
        </p>
      )}
      {result.tones.some((t) => t !== null) && (
        <a href="#speak/calibrate" className="link-quiet">Tones feel off? Recalibrate</a>
      )}
      {!result.soundsChecked && (
        <p className="muted small">
          Sounds weren't checked (only tones): the phone's speech recogniser is off on iPhone because it breaks the mic.
          An Azure key (Settings) checks sounds properly.
        </p>
      )}
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

/** What I actually said, in pinyin: the letters heard (or the expected ones if sounds weren't checked) with the tone heard. */
function saidPinyin(s: Syllable, sc: SpeechScore['syllables'][number]): string | null {
  if (!sc.checked) return null
  const letters = sc.heardPinyin ?? toneless(s.pinyin)
  const tone = sc.tone !== null && sc.heardTone ? sc.heardTone : s.spoken
  return markTone(letters, tone)
}
