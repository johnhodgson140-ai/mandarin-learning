// Real people saying syllables and words, for Tone ears: recordings from audio-cmn (github.com/hugolpz/audio-cmn,
// CC BY-SA): syllables by Chen Wang, words by Yue Tan. Only the ones Tone ears asks about are bundled
// (web/public/voices/, made by scripts/build-voices.ts); hearing real voices alongside the synthetic ones is what
// makes ear training carry over to people.
import { syllableKey, wordKey, type EarItem } from '../ears/logic.ts'

export type HumanVoice = { url: string; name: string }
type Manifest = { syllables: string[]; words: string[] }

const BASE = import.meta.env.BASE_URL
let manifest: Promise<Manifest> | null = null

export function loadHumanVoices(): Promise<Manifest> {
  manifest ??= fetch(`${BASE}voices/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : { syllables: [], words: [] }))
    .catch(() => {
      manifest = null
      return { syllables: [], words: [] }
    })
  return manifest
}


/** The recorded voices for an item (none if it isn't bundled). */
export function humanVoicesFor(item: EarItem, m: Manifest): HumanVoice[] {
  const out: HumanVoice[] = []
  if (item.syllables.length === 1) {
    const key = syllableKey(item.syllables[0].pinyin, item.tones[0])
    if (m.syllables.includes(key)) out.push({ url: `${BASE}voices/s/${key}.mp3`, name: 'Chen Wang (recording)' })
  }
  const key = wordKey(item.text)
  if (m.words.includes(key)) out.push({ url: `${BASE}voices/w/${key}.mp3`, name: 'Yue Tan (recording)' })
  return out
}
