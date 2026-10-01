import { useEffect, useState } from 'react'
import { tokensOfText } from '../../chinese/tokens.ts'
import PlayButton from '../../components/PlayButton.tsx'
import { go } from '../../hash.ts'
import type { Word } from '../../notify/plan.ts'
import { allCards, keepSession } from '../../services/cards.ts'
import { addDailyCards, dailyCount, todaysWords } from '../../services/dailyWords.ts'
import { load, save } from '../../services/storage.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

/** Today's words (also on the widget and in the notifications): look, listen, then drill them as Learn cards. */
export default function Words() {
  const [words, setWords] = useState<Word[] | null>(null)
  useEffect(() => {
    todaysWords().then(setWords, () => setWords([]))
  }, [])
  const rate = rateForLevel(load('level', 1))

  function learnNow(list: Word[]) {
    // They become Learn cards (even when they're not in Anki), first in a fresh Learn session.
    addDailyCards(list)
    const cards = new Map(allCards().map((c) => [c.hanzi, c]))
    keepSession('learn', list.flatMap((w) => cards.get(w.hanzi) ?? []), 0, [])
    save('cardMode', 'learn')
    go('speak/cards')
  }

  return (
    <>
      <header className="settings-header">
        <a href="#speak" className="back-link">‹ Speak</a>
        <h1>Today’s words</h1>
      </header>
      <p className="muted small">
        {dailyCount()} words a day from the built-in list (HSK 1 to 6, most common first), the same ones as the widget and notifications. Change
        how many in Settings → Notifications.
      </p>
      {words === null && <p className="muted">Loading…</p>}
      {words?.length === 0 && <p className="muted">Couldn’t load the word list. Check your connection and try again.</p>}
      <ul className="word-list tone-colours">
        {(words ?? []).map((w, i) => {
          const syllables = tokensOfText(w.hanzi, getLexicon()).flatMap((t) => t.syllables)
          return (
            <li key={w.hanzi} className="word-row">
              <span className="muted small">{i + 1}</span>
              <span className="word-hanzi zh">{w.hanzi}</span>
              <span className="word-info">
                <span className="word-pinyin">
                  {syllables.map((s, j) => <span key={j} className={`t${s.written}`}>{s.pinyin}</span>)}
                </span>
                <span className="muted">{w.english}</span>
              </span>
              <PlayButton id={`word-${w.hanzi}`} label="Hear" className="chip" start={() => speak(w.hanzi, rate, `word-${w.hanzi}`)} />
            </li>
          )
        })}
      </ul>
      {words && words.length > 0 && (
        <button type="button" className="btn btn-primary" onClick={() => learnNow(words)}>Learn these now</button>
      )}
    </>
  )
}
