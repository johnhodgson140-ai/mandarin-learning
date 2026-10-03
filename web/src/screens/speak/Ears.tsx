// Tone ears: hear a syllable or two-syllable word in one of several voices, pick its tones. Adapts to my mistakes.
import { useEffect, useMemo, useState } from 'react'
import { buildParagraph } from '../../chinese/tokens.ts'
import type { Tone } from '../../chinese/tones.ts'
import { earItems, patternOf, pickItem, recordAnswer, weakest, type EarItem, type EarStats } from '../../ears/logic.ts'
import { hskInfo, loadHsk } from '../../services/hsk.ts'
import { load, save } from '../../services/storage.ts'
import { humanVoicesFor, loadHumanVoices, type HumanVoice } from '../../services/humanVoices.ts'
import { playUrl, speakVariety, varietyCount } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

type Mode = 1 | 2
type EarVoice = { kind: 'tts'; index: number } | ({ kind: 'human' } & HumanVoice)
const ROUND = 20
const TONES: { tone: Tone; mark: string }[] = [
  { tone: 1, mark: 'ˉ' },
  { tone: 2, mark: 'ˊ' },
  { tone: 3, mark: 'ˇ' },
  { tone: 4, mark: 'ˋ' },
]

/** My words (deck) plus common HSK 1–3 words: the pool to draw questions from. */
function useItems(mode: Mode): EarItem[] | null {
  const [words, setWords] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadHsk().then((hsk) => {
      if (cancelled) return
      const hskWords = [...hsk].filter(([, i]) => i.level <= 3).map(([w]) => w)
      const mine = [...getLexicon().keys()]
      // Single syllables: every character of those words too.
      const chars = [...new Set([...mine, ...hskWords].flatMap((w) => [...w]))]
      setWords([...new Set([...mine, ...hskWords, ...chars])])
    })
    return () => {
      cancelled = true
    }
  }, [])
  return useMemo(() => {
    if (!words) return null
    const lexicon = getLexicon()
    const tokens = words.map((w) => buildParagraph([w], lexicon)[0]).filter(Boolean)
    return earItems(tokens.map((t) => ({ text: t.text, syllables: t.syllables })), mode)
  }, [words, mode])
}

export default function Ears() {
  const [mode, setMode] = useState<Mode>(() => load<Mode>('earMode', 1))
  const items = useItems(mode)
  const [stats, setStats] = useState<EarStats>(() => load<EarStats>('earStats', {}))
  const [item, setItem] = useState<EarItem | null>(null)
  const [voice, setVoice] = useState<EarVoice>({ kind: 'tts', index: 0 })
  const [humans, setHumans] = useState<Awaited<ReturnType<typeof loadHumanVoices>> | null>(null)
  useEffect(() => {
    void loadHumanVoices().then(setHumans)
  }, [])
  const [answer, setAnswer] = useState<Tone[]>([])
  const [done, setDone] = useState<boolean[]>([])
  const checked = item !== null && answer.length === item.tones.length
  const right = checked && answer.every((t, i) => t === item!.tones[i])

  function next(pool = items) {
    if (!pool?.length) return
    const it = pickItem(pool, stats, item?.text ?? null)
    if (!it) return
    // Half the time a real recording when there is one, else one of the synthetic voices.
    const recorded = humans ? humanVoicesFor(it, humans) : []
    const v: EarVoice =
      recorded.length && Math.random() < 0.5
        ? { kind: 'human', ...recorded[Math.floor(Math.random() * recorded.length)] }
        : { kind: 'tts', index: Math.floor(Math.random() * varietyCount()) }
    setItem(it)
    setVoice(v)
    setAnswer([])
    play(it, v, 0.85 + Math.random() * 0.2)
  }

  function play(it: EarItem, v: EarVoice, rate?: number) {
    if (v.kind === 'human') void playUrl(v.url)
    else void speakVariety(it.text, v.index, rate)
  }

  function choose(tone: Tone) {
    if (!item || checked) return
    const nextAnswer = [...answer, tone]
    setAnswer(nextAnswer)
    if (nextAnswer.length === item.tones.length) {
      const ok = nextAnswer.every((t, i) => t === item.tones[i])
      const updated = recordAnswer(stats, patternOf(item.tones), ok)
      setStats(updated)
      save('earStats', updated)
      setDone([...done, ok])
      navigator.vibrate?.(ok ? 10 : [10, 60, 10])
    }
  }

  function chooseMode(m: Mode) {
    setMode(m)
    save('earMode', m)
    setItem(null)
    setDone([])
  }

  const roundOver = done.length >= ROUND
  const weak = weakest(stats)

  return (
    <>
      <a href="#speak" className="back-link">‹ Speak</a>
      <h1>Tone ears</h1>
      <p className="muted small">Hear it, pick the tones. Different voices each time, real recordings among them: that's what trains the ear.</p>
      <div className="chips">
        <button type="button" className="chip" aria-pressed={mode === 1} onClick={() => chooseMode(1)}>Syllables</button>
        <button type="button" className="chip" aria-pressed={mode === 2} onClick={() => chooseMode(2)}>Tone pairs</button>
      </div>

      {!items && <p className="muted">Loading words…</p>}
      {items && !item && !roundOver && (
        <button type="button" className="btn btn-primary" onClick={() => next()} disabled={items.length === 0}>
          Start ({ROUND} questions)
        </button>
      )}

      {item && !roundOver && (
        <section className="card">
          <p className="muted small">
            {done.length + 1} of {ROUND} · {voice.kind === 'human' ? voice.name : `voice ${voice.index + 1}`}
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => play(item, voice)}>▶ Play again</button>
          {item.tones.map((_, pos) => (
            <div key={pos} className="ear-row">
              {mode === 2 && <span className="muted small">{pos === 0 ? 'First' : 'Second'}</span>}
              <div className="chips">
                {TONES.map(({ tone, mark }) => (
                  <button
                    key={tone}
                    type="button"
                    className="chip ear-tone"
                    aria-pressed={answer[pos] === tone}
                    disabled={checked || answer.length !== pos}
                    onClick={() => choose(tone)}
                  >
                    {tone} {mark}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {checked && (
            <div className="fade-in">
              <p className={right ? 'ear-right' : 'ear-wrong'}>{right ? 'Right' : `It was tone ${item.tones.join(' + ')}`}</p>
              <p>
                <span className="zh ear-word">{item.text}</span> <span className="tone-colours">{item.syllables.map((s, i) => <span key={i} className={`t${s.written}`}>{s.pinyin} </span>)}</span>
                {hskInfo(item.text) && <span className="muted small"> {hskInfo(item.text)!.meaning}</span>}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => next()}>Next</button>
            </div>
          )}
        </section>
      )}

      {roundOver && (
        <section className="card">
          <h2 className="card-title">Round done</h2>
          <p>{done.filter(Boolean).length} of {ROUND} right.</p>
          <button type="button" className="btn btn-primary" onClick={() => { setDone([]); next() }}>Another round</button>
        </section>
      )}

      <p className="muted small">Recordings: Chen Wang and Yue Tan, from audio-cmn (CC BY-SA).</p>
      {weak.length > 0 && (
        <p className="muted small">
          Hardest for you so far: {weak.map((w) => `${w.pattern.replace('-', ' + ')} (${Math.round(w.accuracy * 100)}%)`).join(', ')}. They come up more often.
        </p>
      )}
    </>
  )
}
