// Merging my progress from two devices (phone and Mac, through Firebase): nothing learned on either is lost.
// Pure, so it's tested; services/sync.ts does the fetching and saving.

type State = { last?: number; due?: number; seen?: number }

/** Card states: for each word, the one reviewed most recently (then the one reviewed more often). */
export function mergeStates<S extends State>(a: Record<string, S>, b: Record<string, S>): Record<string, S> {
  const out: Record<string, S> = { ...a }
  for (const [hanzi, s] of Object.entries(b ?? {})) {
    const mine = out[hanzi]
    if (!mine || (s.last ?? 0) > (mine.last ?? 0) || ((s.last ?? 0) === (mine.last ?? 0) && (s.seen ?? 0) > (mine.seen ?? 0))) out[hanzi] = s
  }
  return out
}

/** Words met: all of them, each with the earlier day I met it. */
export function mergeMet<W extends { day: number }>(a: Record<string, W>, b: Record<string, W>): Record<string, W> {
  const out: Record<string, W> = { ...a }
  for (const [hanzi, w] of Object.entries(b ?? {})) if (!out[hanzi] || w.day < out[hanzi].day) out[hanzi] = w
  return out
}

/** Learn order (how far Recall may go): mine first, then any the other device has that I don't. */
export function mergeOrder(a: string[], b: string[]): string[] {
  const seen = new Set(a)
  return [...a, ...(b ?? []).filter((h) => !seen.has(h))]
}

/** Review logs: every rating from both devices, once each, in time order (the newest `cap` kept). */
export function mergeLog<R extends { t: number; m: string; h: string }>(a: R[], b: R[], cap = 10_000): R[] {
  const key = (r: R) => `${r.t}|${r.m}|${r.h}`
  const out = new Map((a ?? []).map((r) => [key(r), r]))
  for (const r of b ?? []) if (!out.has(key(r))) out.set(key(r), r)
  return [...out.values()].sort((x, y) => x.t - y.t).slice(-cap)
}
