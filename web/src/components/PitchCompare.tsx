// My pitch over the whole phrase against the native voice (or the textbook shapes), lined up in time.
import { useEffect, useState } from 'react'
import type { Syllable } from '../chinese/tokens.ts'
import { comparePhrase } from '../services/tone.ts'

type Comparison = NonNullable<Awaited<ReturnType<typeof comparePhrase>>>

const W = 300
const H = 110
const y = (v: number) => 92 - Math.min(1.15, Math.max(-0.15, v)) * 76

function path(points: number[]): string {
  return points.map((v, i) => `${i === 0 ? 'M' : 'L'}${((W * i) / Math.max(1, points.length - 1)).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
}

export default function PitchCompare({ wav, syllables }: { wav: Blob; syllables: Syllable[] }) {
  const [c, setC] = useState<Comparison | null>(null)
  // Worked out once per recording and phrase (parents may pass a new syllables array on every render).
  const phrase = syllables.map((s) => `${s.hanzi}${s.spoken}`).join(' ')
  useEffect(() => {
    let cancelled = false
    const parts = phrase.split(' ').map((p) => ({ hanzi: p.slice(0, -1), spoken: Number(p.slice(-1)) as Syllable['spoken'] }))
    void comparePhrase(wav, parts).then((r) => !cancelled && setC(r), () => {})
    return () => {
      cancelled = true
    }
  }, [wav, phrase])
  if (!c) return null
  const n = syllables.length
  const reference = c.against === 'native' ? 'Native' : 'Target tones'
  return (
    <figure className="pitch-compare">
      <figcaption className="pitch-head">
        <span>Pitch match</span>
        <strong>{c.similarity}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Your pitch compared with ${reference.toLowerCase()}: ${c.similarity} out of 100`}>
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={(W * (i + 1)) / n} x2={(W * (i + 1)) / n} y1={4} y2={96} className="contour-divider" />
        ))}
        {syllables.map((s, i) => (
          <text key={i} x={(W * (i + 0.5)) / n} y={H - 1} className="pitch-label" textAnchor="middle">{s.hanzi}</text>
        ))}
        <path d={path(c.reference)} className="contour-target" />
        <path d={path(c.mine)} className="contour-mine" />
      </svg>
      <div className="contour-legend">
        <span className="key key-mine">You</span>
        <span className="key key-target">{reference}</span>
      </div>
      {c.tips.map((t, i) => <p key={i} className="pitch-tip">{t}</p>)}
    </figure>
  )
}
