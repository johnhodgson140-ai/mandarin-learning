// HSK word list (web/public/hsk.json, built by scripts/build_hsk.py): each word's HSK level, how common it is,
// and a dictionary meaning (CC-CEDICT), all offline. Loaded on first use and cached by the service worker.

export type HskInfo = { level: number; rank: number; meaning: string }
type HskFile = { words: Record<string, [number, number, string]> }

let data: Map<string, HskInfo> | null = null
let loading: Promise<Map<string, HskInfo>> | null = null

export function loadHsk(): Promise<Map<string, HskInfo>> {
  if (data) return Promise.resolve(data)
  loading ??= fetch(`${import.meta.env.BASE_URL}hsk.json`)
    .then((r) => r.json() as Promise<HskFile>)
    .then((json) => {
      data = new Map(Object.entries(json.words).map(([w, [level, rank, meaning]]) => [w, { level, rank, meaning }]))
      return data
    })
    .catch(() => {
      loading = null
      return new Map<string, HskInfo>()
    })
  return loading
}

/** Already-loaded info for a word (null if not loaded yet or not an HSK word). */
export const hskInfo = (word: string): HskInfo | null => data?.get(word) ?? null

/** "HSK 3", or "HSK 7–9" for the advanced band. */
export const hskLabel = (level: number) => (level >= 7 ? 'HSK 7–9' : `HSK ${level}`)

/** The most common HSK words at `level` that aren't in `exclude`: good new words for a story at that level. */
export function newWordsFor(level: number, exclude: Set<string>, count = 40): string[] {
  if (!data) return []
  return [...data]
    .filter(([w, i]) => i.level === level && !exclude.has(w))
    .sort((a, b) => a[1].rank - b[1].rank)
    .slice(0, count)
    .map(([w]) => w)
}
