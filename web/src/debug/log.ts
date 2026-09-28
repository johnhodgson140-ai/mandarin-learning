// A small diagnostic log kept on the device (Settings → Microphone log), so problems that only happen on my
// iPhone can be copied and shared. Keeps the last MAX entries; never sent anywhere by itself.

import { load, save } from '../services/storage.ts'

export type LogEntry = { at: string; event: string; data?: Record<string, unknown> }

const KEY = 'debugLog'
const MAX = 400
let entries: LogEntry[] = load<LogEntry[]>(KEY, [])
let saveTimer: number | undefined

export function log(event: string, data?: Record<string, unknown>): void {
  const now = new Date()
  const at = `${now.toISOString().slice(11, 23)}`
  entries.push(data ? { at, event, data } : { at, event })
  if (entries.length > MAX) entries = entries.slice(-MAX)
  // Save soon (batched), and straight away when the app is hidden (iOS may close it).
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => save(KEY, entries), 300)
}

export const flushLog = () => save(KEY, entries)

export function clearLog(): void {
  entries = []
  save(KEY, entries)
}

export function logText(): string {
  const header = [
    `Shuō mic log · version ${__BUILD_TIME__}`,
    `device: ${navigator.userAgent}`,
    `standalone: ${window.matchMedia?.('(display-mode: standalone)').matches ?? false}`,
    '',
  ]
  return [...header, ...entries.map((e) => `${e.at} ${e.event}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)].join('\n')
}

export const logCount = () => entries.length

/** Log uncaught errors and app visibility changes. */
export function startLogging(): void {
  log('app start', { version: __BUILD_TIME__ })
  window.addEventListener('error', (e) => log('error', { message: e.message, source: `${e.filename}:${e.lineno}` }))
  window.addEventListener('unhandledrejection', (e) => log('unhandled rejection', { reason: String(e.reason) }))
  window.addEventListener('hashchange', () => log('screen ' + (location.hash || '#today')))
  document.addEventListener('visibilitychange', () => {
    log('app ' + document.visibilityState)
    if (document.visibilityState === 'hidden') flushLog()
  })
}
