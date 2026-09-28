import { useEffect, useState } from 'react'
import { addTestCard, cachedMeta, fetchMeta, queuedCount, sync, type SyncMeta } from '../services/anki.ts'
import { MASTERIES } from '../services/anki-mapping.ts'
import { currentUser, isConfigured, signIn, signOut } from '../services/firebase.ts'
import { getKeys, setKeys, type Keys } from '../services/keys.ts'
import { load, save } from '../services/storage.ts'
import './Settings.css'

export default function Settings() {
  const [user, setUser] = useState(currentUser)

  return (
    <>
      <header className="settings-header">
        <a href="#today" className="back-link">‹ Today</a>
        <h1>Settings</h1>
      </header>
      <Account user={user} onChange={() => setUser(currentUser())} />
      {user && <Anki />}
      <MyLevel />
      <ApiKeys />
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
      <h2 className="card-title">Anki</h2>
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
