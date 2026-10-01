import { useEffect, useState } from 'react'
import { addTestCard, cachedMeta, fetchMeta, queuedCount, sync, type SyncMeta } from '../services/anki.ts'
import { exportNewCards, importAnkiFile, newCards } from '../services/ankiFile.ts'
import { daysUntil, rateCard, type IntervalScale, type Rating } from '../cards/srs.ts'
import { buttonColours, intervalScale, setButtonColours, setIntervalScale, type ButtonColours } from '../services/cards.ts'
import { MASTERIES } from '../services/anki-mapping.ts'
import { currentUser, isConfigured, signIn, signOut } from '../services/firebase.ts'
import { getKeys, setKeys, type Keys } from '../services/keys.ts'
import { load, save } from '../services/storage.ts'
import { getTheme, setTheme, type Theme } from '../services/theme.ts'
import HoldToTalk from '../components/HoldToTalk.tsx'
import VoicePicker from '../components/VoicePicker.tsx'
import { clearLog, logCount, logText } from '../debug/log.ts'
import { isNativeApp, nativeRecogniserInfo } from '../native/app.ts'
import { getNotifySettings, setNotifySettings } from '../native/notifications.ts'
import { DAILY_COUNTS, type NotifySettings } from '../notify/plan.ts'
import { hasRecogniser, recogniserBlocked, setRecogniserBlocked } from '../scoring/recognize.ts'
import { AZURE_VOICES, deviceVoices, getDeviceVoice, getSpeed, getVoice, playBlob, rateForLevel, setDeviceVoice, setSpeed, setVoice, speak, SPEEDS, type Speed } from '../services/tts.ts'
import PlayButton from '../components/PlayButton.tsx'
import './Settings.css'

export default function Settings() {
  const [user, setUser] = useState(currentUser)

  return (
    <>
      <header className="settings-header">
        <a href="#today" className="back-link">‹ Today</a>
        <h1>Settings</h1>
      </header>
      {/* Everyday settings first; setup and troubleshooting further down. */}
      <Voice />
      <Voices />
      <Notifications />
      <Flashcards />
      <MyLevel />
      <Appearance />
      <AnkiPhone />
      <ApiKeys />
      <Account user={user} onChange={() => setUser(currentUser())} />
      {user && <Anki />}
      <SpeechCheck />
      <MicTest />
      <p className="muted small">Version {new Date(__BUILD_TIME__).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
    </>
  )
}

function Account({ user, onChange }: { user: { email: string } | null; onChange: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isConfigured)
    return (
      <section className="card">
        <h2 className="card-title">Account</h2>
        <p className="muted">Firebase isn't set up yet. Sign-in and Anki sync appear here once it is.</p>
      </section>
    )

  if (user)
    return (
      <section className="card">
        <h2 className="card-title">Account</h2>
        <p>Signed in as {user.email}</p>
        <button type="button" className="btn btn-secondary" onClick={() => { signOut(); onChange() }}>
          Sign out
        </button>
      </section>
    )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      setPassword('')
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="card-title">Account</h2>
      <p className="muted">Sign in so your phone and Mac share the same words and progress.</p>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

const MASTERY_LABELS = { new: 'New', learning: 'Learning', young: 'Young', mature: 'Mature' } as const

function Anki() {
  const [meta, setMeta] = useState<SyncMeta | null>(cachedMeta)
  const [queued, setQueued] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Refresh from Firebase so the phone sees the Mac's latest sync. Offline: keep the cached values.
    fetchMeta().then(setMeta, () => {})
    queuedCount().then(setQueued, () => {})
  }, [])

  async function run(task: () => Promise<string>) {
    setBusy(true)
    setError(null)
    try {
      setStatus(await task())
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      queuedCount().then(setQueued, () => {})
    }
  }

  const syncNow = () =>
    run(async () => {
      const result = await sync(setStatus)
      setMeta(result.meta)
      const sent = result.sent ? ` Sent ${result.sent} queued card${result.sent === 1 ? '' : 's'} to Anki.` : ''
      return `Synced ${result.meta.total} words.${sent}`
    })

  const testCard = () =>
    run(async () => {
      const outcome = await addTestCard()
      if (outcome === 'added') return 'Test card 测试 added to "05 From the App" in Anki.'
      if (outcome === 'duplicate') return 'The test card 测试 is already in Anki.'
      return 'Anki isn\'t reachable from here, so the test card is queued. It will be sent on the next sync from your Mac.'
    })

  return (
    <section className="card">
      <h2 className="card-title">Anki on your Mac (live sync)</h2>
      <p className="muted">Last sync: {meta ? formatTime(meta.syncedAt) : 'never'}</p>
      {meta && (
        <dl className="counts">
          {MASTERIES.map((m) => (
            <div key={m}>
              <dt>{MASTERY_LABELS[m]}</dt>
              <dd>{meta.counts[m]}</dd>
            </div>
          ))}
        </dl>
      )}
      {meta && <p className="muted">{meta.total} words in total.</p>}
      {queued > 0 && (
        <p className="muted">
          {queued} card{queued === 1 ? '' : 's'} waiting to be sent to Anki on the next sync.
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={syncNow} disabled={busy}>
        {busy ? 'Working…' : 'Sync from Anki'}
      </button>
      <button type="button" className="btn btn-secondary" onClick={testCard} disabled={busy}>
        Send test card
      </button>
      {status && <p className="muted" role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">Sync runs in Chrome on your Mac with Anki open. Your phone uses the last sync.</p>
    </section>
  )
}

function ApiKeys() {
  const [keys, setState] = useState<Keys>(getKeys)

  function update(patch: Partial<Keys>) {
    const next = { ...keys, ...patch }
    setState(next)
    setKeys(next)
  }

  return (
    <section className="card">
      <h2 className="card-title">API keys</h2>
      <p className="muted">Saved only on this device, never uploaded. Enter them on each device you use.</p>
      <label className="field">
        <span>Claude API key (stories and conversations)</span>
        <input type="password" autoComplete="off" spellCheck={false} value={keys.claude}
          onChange={(e) => update({ claude: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span>Azure Speech key (pronunciation grading)</span>
        <input type="password" autoComplete="off" spellCheck={false} value={keys.azure}
          onChange={(e) => update({ azure: e.target.value.trim() })} />
      </label>
      <label className="field">
        <span>Azure region</span>
        <input type="text" autoComplete="off" spellCheck={false} value={keys.azureRegion}
          onChange={(e) => update({ azureRegion: e.target.value.trim() })} />
      </label>
    </section>
  )
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** My level (1–6). It normally goes up by passing a mission at the next level; this is the manual override. */
function MyLevel() {
  const [level, setLevel] = useState(() => load('level', 1))
  return (
    <section className="card">
      <h2 className="card-title">My level</h2>
      <p className="muted small">Goes up when you pass a live mission at the next level. Change it here if it's wrong.</p>
      <div className="chips">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={level === n} onClick={() => { setLevel(n); save('level', n) }}>{n}</button>
        ))}
      </div>
    </section>
  )
}

function Voices() {
  return (
    <section className="card">
      <h2 className="card-title">Voices</h2>
      <p className="muted small">
        Everyone who practises on this phone gets their own voice, so tone checks fit whoever is speaking. Pick who's
        speaking before practising. Progress and cards are shared.
      </p>
      <VoicePicker manage />
    </section>
  )
}

function MicTest() {
  const [clip, setClip] = useState<{ url: string; blob: Blob; seconds: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [count, setCount] = useState(logCount)

  async function copy() {
    try {
      await navigator.clipboard.writeText(logText())
      setStatus('Copied. Paste it into the chat with Claude.')
    } catch {
      setStatus("Couldn't copy: use Share instead.")
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Shuō mic log', text: logText() })
    } catch {
      // cancelled
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">Microphone test</h2>
      <p className="muted small">Record a few times in a row, then play each one back. Every step is written to the log below.</p>
      <HoldToTalk
        onRecorded={(r) => {
          if (clip) URL.revokeObjectURL(clip.url)
          setClip({ url: URL.createObjectURL(r.wav), blob: r.wav, seconds: Math.round(r.seconds * 10) / 10 })
          setError(null)
          setCount(logCount())
        }}
        onError={(m) => {
          setError(m)
          setCount(logCount())
        }}
      />
      {error && <p className="error" role="alert">{error}</p>}
      {clip && (
        <div>
          <p className="muted small">Recorded {clip.seconds} s.</p>
          <PlayButton id={`mic-test-${clip.url}`} label="Play it back" start={() => playBlob(clip.blob, `mic-test-${clip.url}`)} />
        </div>
      )}
      <p><strong>Microphone log</strong> <span className="muted small">({count} lines)</span></p>
      <div className="chips">
        <button type="button" className="chip" onClick={() => void copy()}>Copy log</button>
        {'share' in navigator && <button type="button" className="chip" onClick={() => void share()}>Share log</button>}
        <button type="button" className="chip" onClick={() => { clearLog(); setCount(0); setStatus('Log cleared.') }}>Clear</button>
      </div>
      {status && <p className="muted small">{status}</p>}
    </section>
  )
}

function SpeechCheck() {
  const [blocked, setBlocked] = useState(recogniserBlocked)
  const [native, setNative] = useState<{ available: boolean; onDevice: boolean } | null>(null)
  useEffect(() => void nativeRecogniserInfo().then(setNative), [])
  if (isNativeApp())
    return (
      <section className="card">
        <h2 className="card-title">Sound check</h2>
        <p className="muted small">
          {native?.available === false
            ? "Apple's Mandarin speech recognition isn't available on this iPhone right now, so only tones are checked."
            : `On: Apple's Mandarin speech recogniser checks your sounds after each recording${native?.onDevice ? ', on your iPhone (works offline)' : ''}. An Azure key checks them more precisely.`}
        </p>
      </section>
    )
  if (!hasRecogniser()) return null
  return (
    <section className="card">
      <h2 className="card-title">Sound check</h2>
      {blocked ? (
        <>
          <p className="muted small">
            Off. The phone's speech recogniser can check your sounds for free, but on iPhone it takes over the microphone
            and later recordings fail. Tones are still checked; an Azure key checks sounds properly.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => { setRecogniserBlocked(false); setBlocked(false) }}>Turn on anyway</button>
        </>
      ) : (
        <>
          <p className="muted small">On: the phone's speech recogniser checks your sounds (free). If recordings stop working, turn it off.</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setRecogniserBlocked(true); setBlocked(true) }}>Turn off</button>
        </>
      )}
    </section>
  )
}

function Notifications() {
  const [settings, set] = useState<NotifySettings>(getNotifySettings)
  const [message, setMessage] = useState<string | null>(null)
  if (!isNativeApp()) return null
  const daily = settings.dailyWords
  async function update(next: NotifySettings) {
    set(next)
    const problem = await setNotifySettings(next)
    setMessage(problem)
    if (problem) set(getNotifySettings())
  }
  const rows: [Exclude<keyof NotifySettings, 'dailyWords'>, string, string][] = [
    ['wordOfDay', 'Word of the day', 'A word from your deck with pinyin and meaning, and a tone tip.'],
    ['practice', 'Practice reminder', 'Tells you how many cards are due.'],
    ['streak', 'Streak saver', "Only on days you haven't practised yet."],
  ]
  return (
    <section className="card">
      <h2 className="card-title">Notifications</h2>
      <div className="notify-row">
        <label className="check">
          <input type="checkbox" checked={daily.on} onChange={(e) => void update({ ...settings, dailyWords: { ...daily, on: e.target.checked } })} />
          Today’s words
        </label>
        <span />
        <p className="muted small">
          {daily.count} words from your deck each day, one at a time, then an evening recap. Set the same number on the Today’s words widget.
        </p>
        <div className="chips">
          {DAILY_COUNTS.map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={daily.count === n} onClick={() => void update({ ...settings, dailyWords: { ...daily, count: n } })}>{n}</button>
          ))}
        </div>
        <span />
        <label className="muted small notify-range">
          From <input type="time" className="type-input notify-time" value={daily.from} onChange={(e) => void update({ ...settings, dailyWords: { ...daily, from: e.target.value } })} />
          to <input type="time" className="type-input notify-time" value={daily.to} onChange={(e) => void update({ ...settings, dailyWords: { ...daily, to: e.target.value } })} />
        </label>
      </div>
      {rows.map(([key, title, hint]) => (
        <div key={key} className="notify-row">
          <label className="check">
            <input type="checkbox" checked={settings[key].on} onChange={(e) => void update({ ...settings, [key]: { ...settings[key], on: e.target.checked } })} />
            {title}
          </label>
          <input
            type="time"
            className="type-input notify-time"
            value={settings[key].time}
            onChange={(e) => void update({ ...settings, [key]: { ...settings[key], time: e.target.value } })}
            aria-label={`${title} time`}
          />
          <p className="muted small">{hint}</p>
        </div>
      ))}
      {message && <p className="error">{message}</p>}
    </section>
  )
}

function Voice() {
  const [voice, set] = useState(getVoice)
  const [device, setDevice] = useState(getDeviceVoice)
  const [speed, setSpeedState] = useState<Speed>(getSpeed)
  const [voices, setVoices] = useState(deviceVoices)
  const hasAzure = Boolean(getKeys().azure)
  // Device voices can load after the page does.
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const update = () => setVoices(deviceVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  const test = () => speak('你好，我们一起练习说中文吧。', rateForLevel(), 'voice-test')
  return (
    <section className="card">
      <h2 className="card-title">Voice</h2>
      {hasAzure ? (
        <label className="field">
          <span>Azure voice</span>
          <select value={voice} onChange={(e) => { set(e.target.value); setVoice(e.target.value) }}>
            {AZURE_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
      ) : (
        <label className="field">
          <span>iPhone voice</span>
          <select value={device ?? ''} onChange={(e) => { const uri = e.target.value || null; setDevice(uri); setDeviceVoice(uri) }}>
            <option value="">Clearest installed</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang.replace('_', '-')})</option>)}
          </select>
        </label>
      )}
      <p className="muted small">Speed</p>
      <div className="chips">
        {SPEEDS.map((s) => (
          <button key={String(s)} type="button" className="chip" aria-pressed={speed === s} onClick={() => { setSpeedState(s); setSpeed(s) }}>
            {s === 'auto' ? 'Auto (by level)' : `${s}×`}
          </button>
        ))}
      </div>
      <PlayButton id="voice-test" label="Test" start={test} />
      {!hasAzure && (
        <p className="muted small">
          For a much clearer iPhone voice: iPhone Settings → Accessibility → Spoken Content → Voices → Chinese (China
          mainland) → download one marked <strong>Enhanced</strong> or <strong>Premium</strong>, then pick it above.
          An Azure key switches to natural neural voices.
        </p>
      )}
    </section>
  )
}

const SCALES = [0.5, 0.75, 1, 1.5, 2, 3]
const BUTTONS: { key: keyof IntervalScale; label: string; rating: Rating }[] = [
  { key: 'hard', label: 'Hard', rating: 2 },
  { key: 'good', label: 'Good', rating: 3 },
  { key: 'easy', label: 'Easy', rating: 4 },
]

/** Card intervals (Anki-style modifiers on top of FSRS) and the rating buttons' colours. */
function Flashcards() {
  const [scale, setScale] = useState<IntervalScale>(intervalScale)
  const [colours, setColours] = useState<ButtonColours>(buttonColours)
  const choose = (key: keyof IntervalScale, value: number) => {
    const next = { ...scale, [key]: value }
    setScale(next)
    setIntervalScale(next)
  }
  // What a brand-new card would get with these settings.
  const preview = BUTTONS.map(({ label, rating }) => `${label} ${daysUntil(rateCard(undefined, rating, 0, null, scale), 0)}d`).join(' · ')
  return (
    <section className="card">
      <h2 className="card-title">Flashcards</h2>
      <p className="muted small">Stretch or shrink the gap each button gives. 1× is the standard schedule.</p>
      {BUTTONS.map(({ key, label, rating }) => (
        <fieldset key={key} className="choice">
          <legend><span className={`rate-dot rate-${rating}`} aria-hidden="true" /> {label}</legend>
          <div className="chips">
            {SCALES.map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={scale[key] === v} onClick={() => choose(key, v)}>{v}×</button>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="muted small">A new card: {preview}. Again always comes back in the same session.</p>
      <fieldset className="choice">
        <legend>Button colours</legend>
        <div className="chips">
          {(['colour', 'plain'] as const).map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={colours === c} onClick={() => { setColours(c); setButtonColours(c) }}>
              {c === 'colour' ? 'Colour' : 'Plain'}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  )
}

function Appearance() {
  const [theme, set] = useState<Theme>(getTheme)
  const options: [Theme, string][] = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]
  return (
    <section className="card">
      <h2 className="card-title">Appearance</h2>
      <div className="chips">
        {options.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={theme === value} onClick={() => { set(value); setTheme(value) }}>{label}</button>
        ))}
      </div>
    </section>
  )
}

/** AnkiMobile has no API, so the phone exchanges files with Anki: import an export, export words I added. */
function AnkiPhone() {
  const [meta, setMeta] = useState<SyncMeta | null>(cachedMeta)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(() => newCards().filter((c) => !c.exported).length)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    setStatus('Reading your deck…')
    try {
      const r = await importAnkiFile(file)
      setMeta(cachedMeta())
      setStatus(
        r.hasScheduling
          ? `Imported ${r.total} words.`
          : `Imported ${r.total} words, but the export had no review history, so every word counts as new. Export again with "Include scheduling information" on.`,
      )
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onExport() {
    const n = await exportNewCards()
    setPending(0)
    setStatus(n ? `Exported ${n} word${n === 1 ? '' : 's'}. Import the file into Anki (Hanzi, Pinyin, English).` : 'Nothing new to export.')
  }

  return (
    <section className="card">
      <h2 className="card-title">Anki</h2>
      {meta && (
        <>
          <p className="muted">Word list from {new Date(meta.syncedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}: {meta.total} words</p>
          <dl className="counts">
            {MASTERIES.map((m) => (
              <div key={m}><dt>{MASTERY_LABELS[m]}</dt><dd>{meta.counts[m]}</dd></div>
            ))}
          </dl>
        </>
      )}
      <details className="howto">
        <summary>How to export from AnkiMobile</summary>
        <ol>
          <li>In AnkiMobile, open the deck list and tap the ⚙ next to your deck, then <strong>Export</strong>.</li>
          <li>Choose <strong>Anki Deck Package (.apkg)</strong> and turn on <strong>Include scheduling information</strong>.</li>
          <li>Tap Export, then <strong>Save to Files</strong>.</li>
          <li>Come back here and tap <strong>Import Anki export</strong>. Do this again whenever you want your progress updated.</li>
        </ol>
      </details>
      <label className="btn btn-primary file-btn">
        {busy ? 'Importing…' : 'Import Anki export'}
        <input type="file" accept=".apkg,.colpkg,application/octet-stream,application/zip" onChange={(e) => void onFile(e)} disabled={busy} hidden />
      </label>
      <button type="button" className="btn btn-secondary" onClick={() => void onExport()}>
        Export for Anki{pending ? ` (${pending} new)` : ''}
      </button>
      <p className="muted small">Words you add with + Anki are kept here until you export them. Anki imports the file as Hanzi, Pinyin, English.</p>
      {status && <p className="muted" role="status">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
