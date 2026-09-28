// Firebase Auth + Realtime Database over their REST APIs (no SDK needed).
// All data lives under /users/{uid}/ and the security rules only let that user read or write it.

import { firebaseConfig } from './firebase-config.ts'
import { load, save } from './storage.ts'

type Session = { uid: string; email: string; idToken: string; refreshToken: string; expiresAt: number }

const SESSION_KEY = 'session'

export const isConfigured = firebaseConfig !== null

export function currentUser(): { uid: string; email: string } | null {
  const s = load<Session | null>(SESSION_KEY, null)
  return s ? { uid: s.uid, email: s.email } : null
}

export async function signIn(email: string, password: string): Promise<void> {
  const cfg = requireConfig()
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    localId?: string
    email?: string
    idToken?: string
    refreshToken?: string
    expiresIn?: string
    error?: { message?: string }
  }
  if (!res.ok || !body.idToken || !body.refreshToken || !body.localId) throw new Error(authMessage(body.error?.message))
  save(SESSION_KEY, {
    uid: body.localId,
    email: body.email ?? email,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + Number(body.expiresIn ?? 3600) * 1000,
  } satisfies Session)
}

export function signOut(): void {
  save(SESSION_KEY, null)
}

/** A valid ID token, refreshed when it is within a minute of expiring (tokens last an hour). */
async function idToken(): Promise<Session> {
  const cfg = requireConfig()
  const s = load<Session | null>(SESSION_KEY, null)
  if (!s) throw new Error('Sign in first (Settings → Account).')
  if (s.expiresAt - 60_000 > Date.now()) return s
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    id_token?: string
    refresh_token?: string
    expires_in?: string
    error?: { message?: string }
  }
  if (!res.ok || !body.id_token) {
    signOut()
    throw new Error('Your sign-in has expired. Sign in again in Settings.')
  }
  const next: Session = {
    ...s,
    idToken: body.id_token,
    refreshToken: body.refresh_token ?? s.refreshToken,
    expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
  }
  save(SESSION_KEY, next)
  return next
}

/** Read/write JSON at /users/{uid}/{path}. */
async function db<T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, value?: unknown): Promise<T> {
  const cfg = requireConfig()
  const s = await idToken()
  const url = `${cfg.databaseURL.replace(/\/$/, '')}/users/${s.uid}/${path}.json?auth=${encodeURIComponent(s.idToken)}`
  let res: Response
  try {
    res = await fetch(url, { method, body: value === undefined ? undefined : JSON.stringify(value) })
  } catch {
    throw new Error("Couldn't reach Firebase. Check your internet connection.")
  }
  const body = (await res.json().catch(() => null)) as T | { error?: string } | null
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? body.error : `HTTP ${res.status}`
    throw new Error(`Firebase: ${message}`)
  }
  return body as T
}

export const dbGet = <T>(path: string) => db<T | null>('GET', path)
export const dbPut = (path: string, value: unknown) => db<unknown>('PUT', path, value)
export const dbPush = (path: string, value: unknown) => db<{ name: string }>('POST', path, value)
export const dbDelete = (path: string) => db<null>('DELETE', path)

function requireConfig() {
  if (!firebaseConfig) throw new Error('Firebase is not set up yet.')
  return firebaseConfig
}

function authMessage(code: string | undefined): string {
  switch (code?.split(' ')[0]) {
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
    case 'EMAIL_NOT_FOUND':
      return 'Wrong email or password.'
    case 'INVALID_EMAIL':
      return 'That email address looks wrong.'
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'USER_DISABLED':
      return 'This account is disabled.'
    default:
      return code ? `Sign-in failed: ${code}` : "Couldn't sign in. Check your internet connection."
  }
}
