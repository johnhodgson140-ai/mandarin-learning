// Pure Anki → app mapping (no DOM, no network) so it can be unit-tested with node --test.

export const DECK = 'Mandarin Chinese — Ultimate Read & Speak'
export const NOTE_TYPE = 'Mandarin Ultimate — Word/Phrase'
export const FROM_APP_DECK = `${DECK}::05 From the App`

export type Mastery = 'new' | 'learning' | 'young' | 'mature'
export const MASTERIES: readonly Mastery[] = ['new', 'learning', 'young', 'mature']

/** The subset of AnkiConnect `cardsInfo` we use. */
export type AnkiCard = {
  cardId: number
  note: number
  /** Days for review cards; 0 for new cards; negative seconds for (re)learning cards. */
  interval: number
  /** 0 new · 1 learning · 2 review · 3 relearning */
  type: number
  fields: Record<string, { value: string; order: number }>
}

export type Word = {
  noteId: number
  hanzi: string
  pinyin: string
  english: string
  /** Largest interval (days) across the note's cards. */
  interval: number
  mastery: Mastery
}

export type MasteryCounts = Record<Mastery, number>

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Anki fields hold HTML (the Pinyin field is coloured spans): keep only the text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : match
      }
      return ENTITIES[code.toLowerCase()] ?? match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function masteryFor(studied: boolean, interval: number): Mastery {
  if (!studied) return 'new'
  if (interval < 1) return 'learning'
  if (interval < 21) return 'young'
  return 'mature'
}

/** Group cards by note: fields from the note, mastery from its most-advanced card. */
export function cardsToWords(cards: AnkiCard[]): Word[] {
  const byNote = new Map<number, { fields: AnkiCard['fields']; interval: number; studied: boolean }>()
  for (const card of cards) {
    const entry = byNote.get(card.note)
    const studied = card.type !== 0
    if (!entry) byNote.set(card.note, { fields: card.fields, interval: card.interval, studied })
    else {
      entry.interval = Math.max(entry.interval, card.interval)
      entry.studied ||= studied
    }
  }
  const words: Word[] = []
  for (const [noteId, { fields, interval, studied }] of byNote) {
    const hanzi = stripHtml(fields.Hanzi?.value ?? '')
    if (!hanzi) continue
    words.push({
      noteId,
      hanzi,
      pinyin: stripHtml(fields.Pinyin?.value ?? ''),
      english: stripHtml(fields.English?.value ?? ''),
      interval,
      mastery: masteryFor(studied, interval),
    })
  }
  return words
}

export function countMastery(words: Iterable<Pick<Word, 'mastery'>>): MasteryCounts {
  const counts: MasteryCounts = { new: 0, learning: 0, young: 0, mature: 0 }
  for (const w of words) counts[w.mastery]++
  return counts
}

const TONE_MARKS: Record<string, number> = {}
for (const [tone, chars] of [[1, 'āēīōūǖĀĒĪŌŪǕ'], [2, 'áéíóúǘÁÉÍÓÚǗ'], [3, 'ǎěǐǒǔǚǍĚǏǑǓǙ'], [4, 'àèìòùǜÀÈÌÒÙǛ']] as const) {
  for (const c of chars) TONE_MARKS[c] = tone
}

/** Tone 1–4 from the tone mark in a pinyin syllable; 5 (neutral) when there is none. */
export function toneOf(syllable: string): 1 | 2 | 3 | 4 | 5 {
  for (const c of syllable.normalize('NFC')) {
    const tone = TONE_MARKS[c]
    if (tone) return tone as 1 | 2 | 3 | 4
  }
  return 5
}

/** Pinyin for the Anki Pinyin field, coloured with the deck's `t1`…`t5` span classes. */
export function colourPinyin(syllables: string[]): string {
  return syllables.map((s) => `<span class="t${toneOf(s)}">${escapeHtml(s)}</span>`).join('')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
