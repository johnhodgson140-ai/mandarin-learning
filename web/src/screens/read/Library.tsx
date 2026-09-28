import { useEffect, useState } from 'react'
import { loadDaily } from '../../services/daily.ts'
import { listStories, syncStories, type Story } from '../../services/stories.ts'
import { refreshWords } from '../../services/words.ts'
import './read.css'

export default function Library() {
  const [stories, setStories] = useState<Story[]>(listStories)

  useEffect(() => {
    // Today's stories first (so they're listed even if the app opened here), then the synced ones.
    void loadDaily()
      .catch(() => null)
      .then(() => setStories(listStories()))
      .then(() => syncStories())
      .then((synced) => synced && setStories(synced), () => {})
    refreshWords().catch(() => {})
  }, [])

  return (
    <>
      <header className="read-header">
        <h1>Read</h1>
        <a href="#read/new" className="btn btn-primary link-btn">New story</a>
      </header>
      {stories.length === 0 && <p className="muted">No stories yet. Write your first one.</p>}
      <ul className="story-list">
        {stories.map((s) => (
          <li key={s.id}>
            <a href={`#read/${s.id}`} className="story-row">
              <span className="story-title-zh">{s.titleZh}</span>
              <span className="muted">{s.titleEn}</span>
              <span className="story-meta">
                Level {s.level} · {s.topic}
                {s.knownRatio !== null && ` · ${Math.round(s.knownRatio * 100)}% known`}
                {s.readAt && ' · read'}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
