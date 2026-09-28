import { useState } from 'react'
import { SCENARIOS } from '../../missions/logic.ts'
import { cachedDaily } from '../../services/daily.ts'
import { getKeys } from '../../services/keys.ts'
import { load, save } from '../../services/storage.ts'

export default function Missions() {
  // Which level to play missions at (my own level only changes by passing a boss mission, or in Settings).
  const myLevel = load('level', 1)
  const [level, setLevel] = useState(() => load('missionLevel', myLevel))
  const choose = (n: number) => {
    setLevel(n)
    save('missionLevel', n)
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
      {(cachedDaily()?.missions.length ?? 0) > 0 && (
        <>
          <h2 className="card-title">Today's guided missions</h2>
          <nav className="hub">
            {cachedDaily()!.missions.map((m) => (
              <a key={m.id} href={`#speak/guided/${m.id}`} className="hub-row">
                <span className="hub-title">{m.title}</span>
                <span className="muted">{m.goal} No key needed.</span>
              </a>
            ))}
          </nav>
          <h2 className="card-title">Live missions</h2>
        </>
      )}
      {!getKeys().claude && <p className="muted small">Live missions need a Claude key (Settings); guided ones don't.</p>}
      <p className="muted small">
        You're level {myLevel}. To level up, play a live mission at level {Math.min(6, myLevel + 1)} and reach its goal with pronunciation 75+.
      </p>
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
