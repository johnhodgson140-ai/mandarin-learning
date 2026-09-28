// 5×5 tone-pair accuracy: previous tone (rows) × tone (columns). One hue, light → dark = fewer → more
// syllables said cleanly; every cell also shows its number, so colour is never the only cue.
import { useState } from 'react'
import type { PairStat } from '../grading/toneStats.ts'

const TONES = [1, 2, 3, 4, 5] as const
const label = (t: number) => (t === 5 ? 'N' : String(t))
const tries = (n: number) => `${n} ${n === 1 ? 'try' : 'tries'}`
const name = (t: number) => (t === 5 ? 'a neutral tone' : `tone ${t}`)

export default function ToneHeatmap({ stats }: { stats: Map<string, PairStat> }) {
  const [picked, setPicked] = useState<string | null>(null)
  const pickedStat = picked ? stats.get(picked) : undefined
  return (
    <figure className="heatmap">
      <div className="heatmap-grid" role="table" aria-label="Tone-pair accuracy: previous tone by tone">
        <div role="row" className="heatmap-row">
          <span className="heatmap-corner" role="columnheader">after ↓ / tone →</span>
          {TONES.map((t) => <span key={t} role="columnheader" className="heatmap-head">{label(t)}</span>)}
        </div>
        {TONES.map((prev) => (
          <div role="row" key={prev} className="heatmap-row">
            <span role="rowheader" className="heatmap-head">{label(prev)}</span>
            {TONES.map((tone) => {
              const key = `${prev}-${tone}`
              const s = stats.get(key)
              const acc = s && s.total > 0 ? s.ok / s.total : null
              const dark = acc !== null && acc > 0.55
              return (
                <button
                  key={key}
                  type="button"
                  role="cell"
                  className="heatmap-cell"
                  aria-pressed={picked === key}
                  title={acc === null ? 'No tries yet' : `${Math.round(acc * 100)}% clean (${tries(s!.total)})`}
                  style={acc === null ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round(12 + acc * 78)}%, var(--surface))`, color: dark ? 'var(--surface)' : 'var(--text)' }}
                  onClick={() => setPicked(picked === key ? null : key)}
                >
                  {acc === null ? '–' : `${Math.round(acc * 100)}`}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <figcaption className="muted small">
        {pickedStat
          ? `${name(pickedStat.tone)} after ${name(pickedStat.prev ?? 0)}: ${Math.round((pickedStat.ok / pickedStat.total) * 100)}% clean over ${tries(pickedStat.total)}.`
          : '% of syllables said cleanly, by the tone before (rows) and the tone itself (columns). Darker = better. Tap a cell.'}
      </figcaption>
    </figure>
  )
}
