// Tiny IndexedDB wrapper (no library): attempts and recordings stay on the device.

const DB = 'shuo'
const VERSION = 1
export const STORES = ['attempts', 'recordings'] as const
type Store = (typeof STORES)[number]

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (opening) return opening
  const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      // iOS closes the connection when the app is in the background: forget it so the next call reopens.
      const forget = () => {
        if (opening === p) opening = null
      }
      db.onclose = forget
      db.onversionchange = () => {
        db.close()
        forget()
      }
      resolve(db)
    }
    req.onerror = () => {
      if (opening === p) opening = null
      reject(req.error ?? new Error('IndexedDB unavailable'))
    }
  })
  opening = p
  return p
}

function attempt<T>(db: IDBDatabase, store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'))
  })
}

/** Run one request; if the connection was closed under us (iOS, after backgrounding), reopen once and retry. */
async function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  try {
    return await attempt(await open(), store, mode, fn)
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'InvalidStateError')) throw err
    opening = null
    return attempt(await open(), store, mode, fn)
  }
}

export const idbPut = <T extends { id: string }>(store: Store, value: T) => run(store, 'readwrite', (s) => s.put(value)).then(() => undefined)
export const idbGet = <T>(store: Store, id: string) => run<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)
export const idbAll = <T>(store: Store) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
export const idbDelete = (store: Store, id: string) => run(store, 'readwrite', (s) => s.delete(id)).then(() => undefined)
