import { useEffect, useState } from 'react'
import type { DailyContent, PlanItem } from '../daily/schema.ts'
import { dueCounts } from '../services/cards.ts'
import { dailyCount } from '../services/curriculum.ts'
import { cachedDaily, loadDaily } from '../services/daily.ts'
import { summary } from '../services/progress.ts'
import './Today.css'

const LINKS: Record<PlanItem['kind'], (ref?: string) => string> = {
  cards: () => '#speak/cards',
  dojo: () => '#speak/dojo',
  story: (ref) => `#read/${ref}`,
  mission: (ref) => `#speak/guided/${ref}`,
  free: () => '#speak/free',
}

/** No plan for today (offline, or today's content isn't out yet): words and cards still work. */
const BASIC: PlanItem[] = [
  { kind: 'cards', title_en: 'Review your cards' },
  { kind: 'story', title_en: 'Read a story', ref: 'new' },
]

export default function Today() {
  const [daily, setDaily] = useState<DailyContent | null>(cachedDaily)
  const [loading, setLoading] = useState(!cachedDaily())
  const [stats, setStats] = useState<Awaited<ReturnType<typeof summary>> | null>(null)

  useEffect(() => {
    loadDaily()
      .then((d) => d && setDaily(d))
      .catch(() => {})
      .finally(() => setLoading(false))
    summary().then(setStats, () => {})
  }, [])

  // The plan is written ahead of time; the cards due are counted here, now.
  const due = Object.values(dueCounts()).reduce((a, b) => a + b, 0)
  const cardsTitle = due > 0 ? `Say your cards (${due} due)` : 'Say your cards'
  const listenRef = daily?.plan.items.find((i) => i.kind === 'story' && i.ref)?.ref

  return (
    <>
      <header className="today-header">
        <h1>Today</h1>
        <a href="#settings" className="icon-link" aria-label="Settings">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </header>
      {stats && (
        <p className="today-stats">
          Level {stats.level} · {stats.xp} XP · {stats.streak}-day streak
        </p>
      )}
      {!daily && loading && <p className="muted">Loading today's plan…</p>}
      {(daily || !loading) && (
        <>
          {daily && <p className="muted">{daily.plan.focus_en}</p>}
          <ol className="plan">
            {/* Every day starts with my new words (then cards for them and my reviews, a story, a mission). */}
            <li>
              <a href="#speak/words" className="hub-row plan-row">
                <span className="plan-step">1</span>
                <span className="hub-title">Today’s new words ({dailyCount()})</span>
              </a>
            </li>
            {(daily?.plan.items ?? BASIC).map((item, i) => (
              <li key={i}>
                <a href={LINKS[item.kind](item.ref)} className="hub-row plan-row">
                  <span className="plan-step">{i + 2}</span>
                  <span className="hub-title">{item.kind === 'cards' ? cardsTitle : item.title_en}</span>
                </a>
              </li>
            ))}
            {/* Ears last: today's story again, listening only (text hidden until I check). */}
            {listenRef && (
              <li>
                <a href={`#read/${listenRef}/listen`} className="hub-row plan-row">
                  <span className="plan-step">{(daily?.plan.items ?? BASIC).length + 2}</span>
                  <span className="hub-title">Listen to today’s story</span>
                </a>
              </li>
            )}
          </ol>
          <a href="#speak/words" className="btn btn-primary link-btn start-btn">Start</a>
        </>
      )}
    </>
  )
}
