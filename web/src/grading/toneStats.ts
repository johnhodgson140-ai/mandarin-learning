// Tone-pair accuracy from logged syllables: the 5×5 heatmap (previous tone × tone) and weakest pairs.

import type { Tone } from '../chinese/tones.ts'
import type { AttemptSyllable } from './grade.ts'

export type PairStat = { prev: Tone | null; tone: Tone; total: number; ok: number }

/** Key "prev-tone", with "0" for a syllable at the start of a phrase. */
const key = (prev: Tone | null, tone: Tone) => `${prev ?? 0}-${tone}`

export function pairStats(syllables: Iterable<Pick<AttemptSyllable, 'prevTone' | 'spokenTone' | 'status'>>): Map<string, PairStat> {
  const stats = new Map<string, PairStat>()
  for (const s of syllables) {
    const k = key(s.prevTone, s.spokenTone)
    const stat = stats.get(k) ?? { prev: s.prevTone, tone: s.spokenTone, total: 0, ok: 0 }
    stat.total++
    if (s.status === 'ok') stat.ok++
    stats.set(k, stat)
  }
  return stats
}

/** 5×5 accuracy grid [previous tone 1–5][tone 1–5], null where there's no data yet. */
export function heatmap(stats: Map<string, PairStat>): (number | null)[][] {
  return [1, 2, 3, 4, 5].map((prev) =>
    [1, 2, 3, 4, 5].map((tone) => {
      const s = stats.get(`${prev}-${tone}`)
      return s && s.total > 0 ? s.ok / s.total : null
    }),
  )
}

/** Tone pairs (both syllables toned) I get wrong most often, with at least `minCount` tries. */
export function weakestPairs(stats: Map<string, PairStat>, limit = 4, minCount = 3): [Tone, Tone][] {
  return [...stats.values()]
    .filter((s): s is PairStat & { prev: Tone } => s.prev !== null && s.total >= minCount)
    .sort((a, b) => a.ok / a.total - b.ok / b.total || b.total - a.total)
    .slice(0, limit)
    .map((s) => [s.prev, s.tone])
}
