// Tiny IndexedDB wrapper (no library): attempts and recordings stay on the device.

const DB = 'shuo'
const VERSION = 1
export const STORES = ['attempts', 'recordings'] as const
type Store = (typeof STORES)[number]

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      opening = null
      reject(req.error ?? new Error('IndexedDB unavailable'))
    }
  })
  return opening
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB error'))
      }),
  )
}

export const idbPut = <T extends { id: string }>(store: Store, value: T) => run(store, 'readwrite', (s) => s.put(value)).then(() => undefined)
export const idbGet = <T>(store: Store, id: string) => run<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>)
export const idbAll = <T>(store: Store) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
export const idbDelete = (store: Store, id: string) => run(store, 'readwrite', (s) => s.delete(id)).then(() => undefined)
