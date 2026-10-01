// Per-device storage. Every access is guarded: private mode or blocked storage must never break the app.

const PREFIX = 'shuo.'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

const revisions = new Map<string, number>()
/** How many times `key` has been saved since the app opened: a cheap, exact way to know derived data is stale. */
export const revision = (key: string) => revisions.get(key) ?? 0

export function save(key: string, value: unknown): void {
  revisions.set(key, revision(key) + 1)
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: the value just isn't remembered on this device.
  }
}
