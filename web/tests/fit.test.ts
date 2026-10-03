import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitParams, paramsFrom, replayLoss, histories, MIN_REVIEWS, type Review } from '../src/cards/fit.ts'
import { rateCard, retrievability, W, type CardState, type Rating } from '../src/cards/srs.ts'

const DAY = 86_400_000

/** A learner whose memory follows `truth`, reviewing when the default scheduler says. */
function simulate(truth: readonly number[], cards: number, seed = 1): Review[] {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const log: Review[] = []
  for (let c = 0; c < cards; c++) {
    let t = c * 3_600_000
    let shown: CardState | undefined // what the app schedules with (defaults)
    let real: CardState | undefined // the learner's actual memory
    for (let k = 0; k < 6; k++) {
      let r: Rating = 3
      if (real?.stability && real.last !== undefined) r = rand() < retrievability((t - real.last) / DAY, real.stability) ? 3 : 1
      log.push({ t, m: 'learn', h: `w${c}`, r })
      shown = rateCard(shown, r, t)
      real = rateCard(real, r, t, null, undefined, truth)
      t = Math.max(shown.due, t + DAY)
    }
  }
  return log
}

test('needs enough reviews before fitting', () => {
  assert.equal(fitParams(simulate(W, 10)), null)
})

test('a learner with a stronger memory gets longer first intervals, and the fit predicts them better', () => {
  const truth = [...W]
  truth[2] = W[2] * 3 // Good on a new word lasts three times as long
  const log = simulate(truth, 120)
  assert.ok(replayLoss(histories(log), W).n >= MIN_REVIEWS)
  const fit = fitParams(log)!
  assert.ok(fit.w[2] > W[2] * 1.5, `w2 ${fit.w[2]}`)
  assert.ok(fit.lossFitted < fit.lossDefault)
  assert.equal(paramsFrom(fit), fit.w)
  assert.equal(paramsFrom(fit, false), W)
})

test('reviews logged for a card I already had start from its saved state', () => {
  const before = { seen: 3, stability: 30, difficulty: 5, last: 0, due: 30 * DAY }
  const log: Review[] = [{ t: 20 * DAY, m: 'learn', h: 'x', r: 3, before }]
  const { n, loss } = replayLoss(histories(log), W)
  assert.equal(n, 1)
  assert.ok(loss < 0.2) // 20 days into a 30-day stability: recall was likely, and it happened
})
