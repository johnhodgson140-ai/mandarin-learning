import { useEffect, useState } from 'react'
import { addTestCard, cachedMeta, fetchMeta, queuedCount, sync, type SyncMeta } from '../services/anki.ts'
import { exportNewCards, importAnkiFile, newCards } from '../services/ankiFile.ts'
import { MASTERIES } from '../services/anki-mapping.ts'
import { currentUser, isConfigured, signIn, signOut } from '../services/firebase.ts'
import { getKeys, setKeys, type Keys } from '../services/keys.ts'
import { load, save } from '../services/storage.ts'
import { getTheme, setTheme, type Theme } from '../services/theme.ts'
import { hasRecogniser, recogniserBlocked, setRecogniserBlocked } from '../scoring/recognize.ts'
import { getVoice, setVoice, speak, type VoiceChoice } from '../services/tts.ts'
import './Settings.css'

export default function Settings() {
  const [user, setUser] = useState(currentUser)

  return (
    <>
      <header className="settings-header">
        <a href="#today" className="back-link">‹ Today</a>
        <h1>Settings</h1>
      </header>
      <AnkiPhone />
      <Account user={user} onChange={() => setUser(currentUser())} />
      {user && <Anki />}
      <MyLevel />
      <SpeechCheck />
      <Voice />
      <Appearance />
      <ApiKeys />
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

function SpeechCheck() {
  const [blocked, setBlocked] = useState(recogniserBlocked)
  if (!hasRecogniser()) return null
  return (
    <section className="card">
      <h2 className="card-title">Sound check</h2>
      {blocked ? (
        <>
          <p className="muted small">The iPhone's speech recogniser is off: a recording came out silent while it was on. Tones are still checked.</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setRecogniserBlocked(false); setBlocked(false) }}>Turn it back on</button>
        </>
      ) : (
        <p className="muted small">On: the iPhone's speech recogniser checks your sounds (free). An Azure key checks them more precisely.</p>
      )}
    </section>
  )
}

function Voice() {
  const [voice, set] = useState<VoiceChoice>(getVoice)
  const hasAzure = Boolean(getKeys().azure)
  return (
    <section className="card">
      <h2 className="card-title">Voice</h2>
      <div className="chips">
        {(['female', 'male'] as const).map((v) => (
          <button key={v} type="button" className="chip" aria-pressed={voice === v} onClick={() => { set(v); setVoice(v) }}>
            {v === 'female' ? 'Female' : 'Male'}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => void speak('你好，我们一起练习说中文吧。', 0.9)}>▶ Test</button>
      </div>
      {hasAzure ? (
        <p className="muted small">Natural Azure voice ({voice === 'female' ? 'Xiaoxiao' : 'Yunxi'}).</p>
      ) : (
        <p className="muted small">
          Using the iPhone's own voice. For a clearer one: iPhone Settings → Accessibility → Spoken Content → Voices →
          Chinese (China mainland) → download a voice marked Enhanced or Premium. An Azure key switches to a natural voice.
        </p>
      )}
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
