import { useState } from 'react'
import { SCENARIOS } from '../../missions/logic.ts'
import { load, save } from '../../services/storage.ts'

export default function Missions() {
  const [level, setLevel] = useState(() => load('level', 1))
  const choose = (n: number) => {
    setLevel(n)
    save('level', n)
  }
  return (
    <>
      <header className="settings-header">
        <a href="#speak" className="back-link">‹ Speak</a>
        <h1>Missions</h1>
      </header>
      <fieldset className="choice">
        <legend>Level</legend>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={level === n} onClick={() => choose(n)}>{n}</button>
          ))}
        </div>
      </fieldset>
      <nav className="hub">
        {SCENARIOS.map((s) => (
          <a key={s.id} href={`#speak/mission/${s.id}`} className="hub-row">
            <span className="hub-title">{s.title}</span>
            <span className="muted">{s.goal}</span>
          </a>
        ))}
      </nav>
    </>
  )
}
