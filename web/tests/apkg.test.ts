import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import initSqlJs from 'sql.js'
import { readDeck, toAnkiText } from '../src/cards/apkg.ts'

const require = createRequire(import.meta.url)
const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) })

/** A tiny collection shaped like a modern Anki export. */
function fakeExport(): Uint8Array {
  const db = new SQL.Database()
  db.run(`create table notetypes (id integer, name text);
          create table fields (ntid integer, ord integer, name text);
          create table decks (id integer, name text);
          create table notes (id integer, mid integer, flds text);
          create table cards (id integer, nid integer, did integer, ivl integer, type integer);`)
  db.run(`insert into notetypes values (1, 'Mandarin Ultimate — Word/Phrase'), (2, 'Mandarin Ultimate — Radical')`)
  db.run(`insert into fields values (1,0,'Hanzi'),(1,1,'Pinyin'),(1,2,'English'),(1,3,'Example'),(2,0,'Radical')`)
  db.run(`insert into decks values (10, 'Mandarin' || char(31) || '02 Core Words')`)
  const note = (id: number, mid: number, ...f: string[]) => db.run('insert into notes values (?, ?, ?)', [id, mid, f.join('\x1f')])
  note(100, 1, '你好', '<span class="t3">nǐ</span><span class="t3">hǎo</span>', 'hello', '你好！')
  note(101, 1, '谢谢', 'xièxie', 'thank you', '')
  note(102, 1, '朋友', 'péngyou', 'friend', '')
  note(103, 1, 'hello', 'x', 'no Chinese: skipped', '')
  note(200, 2, '口')
  const card = (id: number, nid: number, ivl: number, type: number) => db.run('insert into cards values (?, ?, 10, ?, ?)', [id, nid, ivl, type])
  card(1, 100, 30, 2)
  card(2, 100, 3, 2)
  card(3, 101, 0, 0)
  card(4, 102, -600, 1)
  card(5, 103, 0, 0)
  card(6, 200, 50, 2)
  const bytes = db.export()
  db.close()
  return zipSync({ 'collection.anki21': bytes, media: new TextEncoder().encode('{}') })
}

test('readDeck: my note type, fields by name, mastery from the most advanced card', () => {
  const deck = readDeck(SQL, fakeExport())
  assert.equal(deck.noteType, 'Mandarin Ultimate — Word/Phrase')
  assert.equal(deck.hasScheduling, true)
  assert.deepEqual(
    deck.words.map((w) => [w.hanzi, w.pinyin, w.english, w.section, w.mastery]),
    [
      ['你好', 'nǐhǎo', 'hello', '02 Core Words', 'mature'],
      ['谢谢', 'xièxie', 'thank you', '02 Core Words', 'new'],
      ['朋友', 'péngyou', 'friend', '02 Core Words', 'learning'],
    ],
  )
})

test('readDeck rejects files that are not Anki exports', () => {
  assert.throws(() => readDeck(SQL, zipSync({ 'readme.txt': new Uint8Array([1]) })), /doesn't look like an Anki export/)
})

test('toAnkiText makes a tab-separated file Anki can import', () => {
  assert.equal(
    toAnkiText([{ hanzi: '球衣', pinyin: 'qiúyī', english: 'football\tshirt' }]),
    '#separator:tab\n#html:false\n#columns:Hanzi\tPinyin\tEnglish\n球衣\tqiúyī\tfootball shirt\n',
  )
})
