import { useState } from 'react'
import { go } from '../../hash.ts'
import { getKeys } from '../../services/keys.ts'
import { load, save } from '../../services/storage.ts'
import { generateStory, LENGTHS, TOPICS, type StoryLength, type Topic } from '../../services/stories.ts'
import { getLexicon, knownWords } from '../../services/words.ts'
import './read.css'

export default function NewStory() {
  const [level, setLevel] = useState(() => load('level', 1))
  const [topic, setTopic] = useState<Topic>(() => load<Topic>('topic', 'football'))
  const [length, setLength] = useState<StoryLength>('short')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasKey = Boolean(getKeys().claude)
  const hasWords = knownWords(getLexicon()).length > 0

  async function write() {
    setBusy(true)
    setError(null)
    save('level', level)
    save('topic', topic)
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
        <h1>New story</h1>
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

      {!hasWords && (
        <p className="muted small">
          Your Anki words aren't synced yet, so this story uses standard HSK vocabulary for the level.
        </p>
      )}
      {!hasKey && (
        <p className="muted">
          Add your Claude API key in <a href="#settings">Settings</a> to write stories.
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
