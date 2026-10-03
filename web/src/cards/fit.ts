// Fit the scheduler to me: FSRS's defaults come from millions of other people's reviews; with a few hundred of mine,
// the parts that matter most can be fitted to how I actually remember. Pure and cheap (grid searches over a replay
// of my review log), so it runs in the browser with no library.
//
// What's fitted: the first-review stabilities w0–w3 (how long a new word lasts after Again / Hard / Good / Easy,
// FSRS's own first fitting step), how fast stability grows after a successful review (w8) and how much a lapse keeps
// (w11). The fit is only used when it predicts my past reviews better than the defaults.

import { rateCard, retrievability, W, type CardState, type Rating } from './srs.ts'

const DAY = 24 * 60 * 60 * 1000

/** One rating as logged: when, which card (mode + word), how I rated it, and the card's state just before. */
export type Review = { t: number; m: string; h: string; r: Rating; before?: Pick<CardState, 'seen' | 'stability' | 'difficulty' | 'last' | 'due'> }

export type Fit = { w: number[]; reviews: number; lossDefault: number; lossFitted: number; fittedAt: number }

/** At least this many reviews a day or more after the one before (the ones that test memory). */
export const MIN_REVIEWS = 200

/** Each card's reviews in time order. */
export function histories(log: Review[]): Review[][] {
  const by = new Map<string, Review[]>()
  for (const r of log) {
    const k = `${r.m}|${r.h}`
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return [...by.values()].map((h) => h.sort((a, b) => a.t - b.t))
}

/**
 * Replay my reviews with parameters `w`: before each review a day or more after the last, the predicted chance of
 * recalling it, scored against what happened (Again = forgot). Mean log loss (lower = better) and how many reviews.
 */
export function replayLoss(cards: Review[][], w: readonly number[]): { loss: number; n: number } {
  let loss = 0
  let n = 0
  for (const reviews of cards) {
    let state: CardState | undefined = reviews[0].before?.seen ? ({ lastScore: null, ...reviews[0].before } as CardState) : undefined
    for (const rv of reviews) {
      if (state?.stability && state.last !== undefined && rv.t - state.last >= DAY) {
        const p = Math.min(0.999, Math.max(0.001, retrievability((rv.t - state.last) / DAY, state.stability)))
        loss -= rv.r > 1 ? Math.log(p) : Math.log(1 - p)
        n++
      }
      state = rateCard(state, rv.r, rv.t, null, undefined, w)
    }
  }
  return { loss: n ? loss / n : 0, n }
}

/** Log-spaced candidates around a value. */
const around = (v: number, lo: number, hi: number, steps = 13) =>
  Array.from({ length: steps }, (_, i) => Math.min(hi, Math.max(lo, v * Math.exp(((i - (steps - 1) / 2) / ((steps - 1) / 2)) * Math.log(4)))))

/** Fit to my log; null until there are enough reviews. */
export function fitParams(log: Review[], now = Date.now()): Fit | null {
  const cards = histories(log)
  const base = replayLoss(cards, W)
  if (base.n < MIN_REVIEWS) return null
  const w = [...W]
  const tryIndex = (i: number, candidates: number[], subset = cards) => {
    let best = w[i]
    let bestLoss = replayLoss(subset, w).loss
    for (const c of candidates) {
      w[i] = c
      const { loss } = replayLoss(subset, w)
      if (loss < bestLoss - 1e-6) {
        best = c
        bestLoss = loss
      }
    }
    w[i] = best
  }
  for (let round = 0; round < 2; round++) {
    // w0–w3 only matter for cards first rated here: fit each on those cards.
    for (let g = 1; g <= 4; g++) {
      const subset = cards.filter((c) => !c[0].before?.seen && c[0].r === g)
      if (subset.length >= 10) tryIndex(g - 1, around(w[g - 1], 0.05, 100), subset)
    }
    // Keep them in order: Again ≤ Hard ≤ Good ≤ Easy.
    for (let g = 1; g < 4; g++) w[g] = Math.max(w[g], w[g - 1])
    tryIndex(8, [-0.6, -0.4, -0.2, -0.1, 0, 0.1, 0.2, 0.4, 0.6].map((d) => W[8] + d))
    tryIndex(11, around(W[11], 0.3, 6, 9))
  }
  const fitted = replayLoss(cards, w)
  return { w, reviews: base.n, lossDefault: base.loss, lossFitted: fitted.loss, fittedAt: now }
}

/** The parameters to schedule with: the fit if it's better than the defaults, else the defaults. */
export const paramsFrom = (fit: Fit | null, on = true): readonly number[] => (on && fit && fit.lossFitted < fit.lossDefault ? fit.w : W)
