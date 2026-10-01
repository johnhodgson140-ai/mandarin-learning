import { useEffect, useState } from 'react'
import { tokensOfText } from '../../chinese/tokens.ts'
import PlayButton from '../../components/PlayButton.tsx'
import { todaysWords } from '../../services/dailyWords.ts'
import { getLexicon, loadDeck } from '../../services/words.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { load } from '../../services/storage.ts'

/** Today's words (also on the widget and in the notifications): look, listen, then drill them as Learn cards. */
export default function Words() {
  const [words, setWords] = useState(() => todaysWords())
  useEffect(() => {
    // The deck may not be loaded yet the first time the app opens.
    if (words.length === 0) void loadDeck().then(() => setWords(todaysWords()))
  }, [words.length])
  const rate = rateForLevel(load('level', 1))
  const rows = words.map((w) => ({ ...w, syllables: tokensOfText(w.hanzi, getLexicon()).flatMap((t) => t.syllables) }))

  return (
    <>
      <header className="settings-header">
        <a href="#speak" className="back-link">‹ Speak</a>
        <h1>Today’s words</h1>
      </header>
      <p className="muted small">
        {words.length} new words from your deck each day, in deck order: the same ones as the widget and notifications. Change how many in
        Settings → Notifications.
      </p>
      {words.length === 0 && <p className="muted">Your deck hasn’t loaded yet.</p>}
      <ul className="word-list tone-colours">
        {rows.map((w, i) => (
          <li key={w.hanzi} className="word-row">
            <span className="muted small">{i + 1}</span>
            <span className="word-hanzi zh">{w.hanzi}</span>
            <span className="word-info">
              <span className="word-pinyin">
                {w.syllables.map((s, j) => <span key={j} className={`t${s.written}`}>{s.pinyin}</span>)}
              </span>
              <span className="muted">{w.english}</span>
            </span>
            <PlayButton id={`word-${w.hanzi}`} label="Hear" className="chip" start={() => speak(w.hanzi, rate, `word-${w.hanzi}`)} />
          </li>
        ))}
      </ul>
      {words.length > 0 && (
        <a href="#speak/cards/today" className="btn btn-primary link-btn">Learn these now</a>
      )}
    </>
  )
}
