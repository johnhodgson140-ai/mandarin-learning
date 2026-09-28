// Pitch contour overlay: mine vs the target tone shape (and the native voice when available).
// Values are scaled to the speaker's range: 0 = lowest, 1 = highest.

type Props = {
  /** My contour per syllable (null where the syllable wasn't heard). */
  mine: (number[] | null)[]
  /** Textbook shape per syllable. */
  target: number[][]
  /** The native speaker across the whole word. */
  native?: number[] | null
}

const W = 300
const H = 120

const y = (v: number) => 110 - ((Math.min(1.1, Math.max(-0.1, v)) + 0.1) / 1.2) * 100

function path(points: number[], x0: number, x1: number): string {
  if (points.length === 0) return ''
  return points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(x0 + ((x1 - x0) * i) / Math.max(1, points.length - 1)).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
}

export default function ContourChart({ mine, target, native }: Props) {
  const n = target.length
  const slot = (i: number): [number, number] => [(W * i) / n + 6, (W * (i + 1)) / n - 6]
  return (
    <figure className="contour">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pitch: your voice compared with the target">
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={(W * (i + 1)) / n} x2={(W * (i + 1)) / n} y1={8} y2={112} className="contour-divider" />
        ))}
        {target.map((t, i) => <path key={`t${i}`} d={path(t, ...slot(i))} className="contour-target" />)}
        {native && <path d={path(native, 6, W - 6)} className="contour-native" />}
        {mine.map((m, i) => m && <path key={`m${i}`} d={path(m, ...slot(i))} className="contour-mine" />)}
      </svg>
      <figcaption className="contour-legend">
        <span className="key key-mine">You</span>
        <span className="key key-target">Target shape</span>
        {native && <span className="key key-native">Native</span>}
      </figcaption>
    </figure>
  )
}
