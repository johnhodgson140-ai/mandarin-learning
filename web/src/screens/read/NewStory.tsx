import { useEffect, useState } from 'react'
import type { PackStory } from '../../daily/schema.ts'
import { go } from '../../hash.ts'
import { getKeys } from '../../services/keys.ts'
import { addPackStory, packStories } from '../../services/pack.ts'
import { load, save } from '../../services/storage.ts'
import { generateStory, getStory, LENGTHS, TOPICS, type StoryLength, type Topic } from '../../services/stories.ts'
import { getLexicon } from '../../services/words.ts'
import './read.css'

export default function NewStory() {
  const [level, setLevel] = useState(() => load('storyLevel', load('level', 1)))
  const [topic, setTopic] = useState<Topic>(() => load<Topic>('topic', 'football'))
  const [length, setLength] = useState<StoryLength>(() => load<StoryLength>('storyLength', 'short'))
  const [pack, setPack] = useState<PackStory[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasKey = Boolean(getKeys().claude)
  const hasWords = getLexicon().size > 0

  useEffect(() => {
    packStories().then(setPack, () => setPack([]))
  }, [])
  useEffect(() => {
    save('storyLevel', level)
    save('topic', topic)
    save('storyLength', length)
  }, [level, topic, length])

  const atLevel = (pack ?? []).filter((s) => s.level === level)
  const exact = atLevel.filter((s) => s.topic === topic && s.length === length)
  // Nothing at exactly this topic + length: offer the rest of the level, this topic first.
  const nearby = exact.length ? [] : [...atLevel].sort((a, b) => Number(b.topic === topic) - Number(a.topic === topic))

  async function open(s: PackStory) {
    go(`read/${await addPackStory(s)}`)
  }

  async function write() {
    setBusy(true)
    setError(null)
    try {
      const story = await generateStory(level, topic, length)
      go(`read/${story.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <>
      <header className="settings-header">
        <a href="#read" className="back-link">‹ Library</a>
        <h1>Stories</h1>
      </header>

      <fieldset className="choice">
        <legend>Level</legend>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={level === n} onClick={() => setLevel(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>Topic</legend>
        <div className="chips">
          {TOPICS.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice">
        <legend>Length</legend>
        <div className="chips">
          {(Object.keys(LENGTHS) as StoryLength[]).map((l) => (
            <button key={l} type="button" className="chip" aria-pressed={length === l} onClick={() => setLength(l)}>
              {LENGTHS[l].label} · {LENGTHS[l].chars} 字
            </button>
          ))}
        </div>
      </fieldset>

      <h2 className="card-title">Ready-made</h2>
      {pack === null && <p className="muted small">Loading…</p>}
      {pack !== null && exact.length === 0 && (
        <p className="muted small">
          {atLevel.length ? `None for ${topic} at this length yet. Other level ${level} stories:` : `No ready-made stories at level ${level} yet.`}
        </p>
      )}
      <ul className="story-list">
        {(exact.length ? exact : nearby).map((s) => (
          <li key={s.id}>
            <button type="button" className="story-row" onClick={() => void open(s)}>
              <span className="story-title-zh">{s.title_zh}</span>
              <span className="muted">{s.title_en}</span>
              <span className="story-meta">
                Level {s.level} · {s.topic} · {LENGTHS[s.length].label.toLowerCase()}
                {getStory(s.id)?.readAt && ' · read'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="card-title">Write a new one</h2>
      {hasKey && !hasWords && (
        <p className="muted small">
          Your word list hasn't loaded yet, so this story uses standard HSK vocabulary for the level.
        </p>
      )}
      {!hasKey && (
        <p className="muted small">
          Writing a fresh story on demand needs a Claude API key (<a href="#settings">Settings</a>). The ready-made ones don't.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn btn-primary" onClick={write} disabled={busy || !hasKey}>
        {busy ? 'Writing your story…' : 'Write story'}
      </button>
      {busy && <p className="muted small" role="status">This usually takes 20–60 seconds.</p>}
    </>
  )
}
