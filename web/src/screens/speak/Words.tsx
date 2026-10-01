import { useEffect, useState } from 'react'
import { tokensOfText } from '../../chinese/tokens.ts'
import PlayButton from '../../components/PlayButton.tsx'
import { go } from '../../hash.ts'
import { isNativeApp } from '../../native/app.ts'
import { cardStates } from '../../services/cards.ts'
import { curriculumList, dailyCount, moreWordsToday, myWords, todaysWords, type Word } from '../../services/curriculum.ts'
import { load, save } from '../../services/storage.ts'
import { rateForLevel, speak } from '../../services/tts.ts'
import { getLexicon } from '../../services/words.ts'

/** The iPhone app: widgets and notifications follow the new set. */
const refreshWidgets = () => (isNativeApp() ? void import('../../native/notifications.ts').then((m) => m.refreshNotifications()) : undefined)

/** Today's new words (also on the widget and in the notifications): look and listen, then learn them as cards. */
export default function Words() {
  const [words, setWords] = useState<Word[] | null>(null)
  const [total, setTotal] = useState(0)
  useEffect(() => {
    todaysWords().then(setWords, () => setWords([]))
    curriculumList().then((l) => setTotal(l.length), () => {})
  }, [])
  const rate = rateForLevel(load('level', 1))
  const rated = cardStates('learn')
  const met = Object.keys(myWords()).length

  function start() {
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
        {dailyCount()} new words a day from the most common words in Chinese (HSK 1 to 6), at your pace: a word you don’t get to waits for
        tomorrow. They’re your new Learn cards today. {total > 0 && `You’ve met ${met} of ${total}.`}
      </p>
      {words === null && <p className="muted">Loading…</p>}
      {words?.length === 0 && <p className="muted">Couldn’t load the word list. Check your connection and try again.</p>}
      <ul className="word-list tone-colours">
        {(words ?? []).map((w, i) => {
          const syllables = tokensOfText(w.hanzi, getLexicon()).flatMap((t) => t.syllables)
          return (
            <li key={w.hanzi} className="word-row">
              <span className="muted small">{rated[w.hanzi] ? '✓' : i + 1}</span>
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
        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void moreWordsToday(5).then(setWords).then(refreshWidgets)}>
            5 more new words
          </button>
          <button type="button" className="btn btn-primary" onClick={start}>
            {words.every((w) => rated[w.hanzi]) ? 'Review cards' : 'Learn them'}
          </button>
        </div>
      )}
      <p className="muted small">Already know a word? Rate it Easy in Learn and it won’t come back for weeks.</p>
    </>
  )
}
