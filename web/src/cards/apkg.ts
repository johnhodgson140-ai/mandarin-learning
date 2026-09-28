// Read an Anki export (.apkg / .colpkg) in the browser: zip → (zstd) → SQLite → my words with mastery.
// No DOM here, so it runs under node --test too. Anki's "unicase" collation isn't available in sql.js, so
// queries never compare on name columns; small tables are filtered in JS instead.

import { unzipSync } from 'fflate'
import { decompress } from 'fzstd'
import type { Database, SqlJsStatic } from 'sql.js'
import { masteryFor, stripHtml, type Mastery } from '../services/anki-mapping.ts'

export const PREFERRED_NOTE_TYPE = 'Mandarin Ultimate — Word/Phrase'

export type ImportedWord = {
  noteId: number
  hanzi: string
  pinyin: string
  english: string
  example: string
  section: string
  interval: number
  mastery: Mastery
}

export type ImportedDeck = { words: ImportedWord[]; noteType: string; hasScheduling: boolean }

/** The SQLite bytes inside an export, whichever Anki version made it. */
export function collectionBytes(file: Uint8Array): Uint8Array {
  const entries = unzipSync(file)
  if (entries['collection.anki21b']) return decompress(entries['collection.anki21b'])
  const legacy = entries['collection.anki21'] ?? entries['collection.anki2']
  if (!legacy) throw new Error("This doesn't look like an Anki export (.apkg or .colpkg).")
  return legacy
}

const rows = (db: Database, sql: string) => db.exec(sql)[0]?.values ?? []

const FIELD_NAMES = {
  hanzi: ['hanzi', 'simplified', 'chinese', 'word', 'front', 'expression'],
  pinyin: ['pinyin', 'reading'],
  english: ['english', 'meaning', 'definition', 'back', 'translation'],
  example: ['example', 'sentence'],
}

export function readDeck(SQL: SqlJsStatic, file: Uint8Array): ImportedDeck {
  const db = new SQL.Database(collectionBytes(file))
  try {
    const modern = rows(db, "select name from sqlite_master where type = 'table' and name = 'notetypes'").length > 0
    if (!modern) throw new Error('This export is from a very old Anki version. Please update Anki and export again.')

    // Note types and their fields.
    const types = rows(db, 'select id, name from notetypes') as [number, string][]
    const fields = rows(db, 'select ntid, ord, name from fields') as [number, number, string][]
    const fieldsOf = (ntid: number) => fields.filter((f) => f[0] === ntid).sort((a, b) => a[1] - b[1]).map((f) => f[2])
    const decks = new Map(rows(db, 'select id, name from decks') as [number, string][])

    // Prefer my deck's note type; otherwise the type with the most notes that has a Chinese-looking field.
    const counts = new Map(rows(db, 'select mid, count(*) from notes group by mid') as [number, number][])
    const ranked = [...types].sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0))
    const chosen = ranked.find((t) => t[1] === PREFERRED_NOTE_TYPE) ?? ranked.find((t) => (counts.get(t[0]) ?? 0) > 0)
    if (!chosen) throw new Error('No notes found in this export.')
    const names = fieldsOf(chosen[0])
    const index = (want: string[]) => {
      const i = names.findIndex((n) => want.includes(n.toLowerCase()))
      return i
    }
    const at = { hanzi: Math.max(0, index(FIELD_NAMES.hanzi)), pinyin: index(FIELD_NAMES.pinyin), english: index(FIELD_NAMES.english), example: index(FIELD_NAMES.example) }

    const noteRows = rows(
      db,
      `select n.id, n.flds, max(c.ivl), max(c.type), min(c.did) from notes n join cards c on c.nid = n.id
       where n.mid = ${Number(chosen[0])} group by n.id order by n.id`,
    ) as [number, string, number, number, number][]

    let hasScheduling = false
    const words: ImportedWord[] = []
    for (const [noteId, flds, ivl, type, did] of noteRows) {
      const f = flds.split('\x1f')
      const get = (i: number) => (i >= 0 ? stripHtml(f[i] ?? '') : '')
      const hanzi = get(at.hanzi)
      if (!/\p{Script=Han}/u.test(hanzi)) continue
      if (type !== 0) hasScheduling = true
      words.push({
        noteId,
        hanzi,
        pinyin: get(at.pinyin),
        english: get(at.english),
        example: get(at.example),
        section: (decks.get(did) ?? '').split('\x1f').pop() ?? '',
        interval: ivl,
        mastery: masteryFor(type !== 0, ivl),
      })
    }
    return { words, noteType: chosen[1], hasScheduling }
  } finally {
    db.close()
  }
}

/** Words I tapped "+ Anki" on, as a tab-separated file Anki can import (Hanzi, Pinyin, English). */
export function toAnkiText(cards: { hanzi: string; pinyin: string; english: string }[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim()
  return ['#separator:tab', '#html:false', '#columns:Hanzi\tPinyin\tEnglish', ...cards.map((c) => [c.hanzi, c.pinyin, c.english].map(clean).join('\t'))].join('\n') + '\n'
}
