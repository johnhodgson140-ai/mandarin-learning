import { useEffect, useState } from 'react'
import type { DailyContent, PlanItem } from '../daily/schema.ts'
import { cachedDaily, loadDaily } from '../services/daily.ts'
import './Today.css'

const LINKS: Record<PlanItem['kind'], (ref?: string) => string> = {
  cards: () => '#speak/cards',
  dojo: () => '#speak/dojo',
  story: (ref) => `#read/${ref}`,
  mission: (ref) => `#speak/guided/${ref}`,
  free: () => '#speak/free',
}

export default function Today() {
  const [daily, setDaily] = useState<DailyContent | null>(cachedDaily)

  useEffect(() => {
    loadDaily().then(setDaily, () => {})
  }, [])

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
      {!daily && <p className="muted">Loading today's plan…</p>}
      {daily && (
        <>
          <p className="muted">{daily.plan.focus_en}</p>
          <ol className="plan">
            {daily.plan.items.map((item, i) => (
              <li key={i}>
                <a href={LINKS[item.kind](item.ref)} className="hub-row plan-row">
                  <span className="plan-step">{i + 1}</span>
                  <span className="hub-title">{item.title_en}</span>
                </a>
              </li>
            ))}
          </ol>
          <a href={LINKS[daily.plan.items[0].kind](daily.plan.items[0].ref)} className="btn btn-primary link-btn start-btn">Start</a>
        </>
      )}
    </>
  )
}
