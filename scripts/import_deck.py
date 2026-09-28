#!/usr/bin/env python3
"""Import my Anki deck export (.apkg) into the app.

Usage: python3 scripts/import_deck.py path/to/deck.apkg

Writes:
  web/public/deck.json  - every word/phrase note (hanzi, pinyin, English, section, example) for the app:
                          "Say your cards", Anki pinyin in the Reader, and my word list before Anki sync is set up.
  content/words.json    - the word list the daily Claude session writes stories from (docs/DAILY.md).
Both files are public (this repo is public).
"""
import html, json, re, sqlite3, subprocess, sys, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTE_TYPE = 'Mandarin Ultimate — Word/Phrase'


def plain(field: str) -> str:
    text = re.sub(r'<br\s*/?>', ' ', field)
    text = html.unescape(re.sub(r'<[^>]+>', '', text))
    return re.sub(r'\s+', ' ', text).strip()


def connect(path: Path) -> sqlite3.Connection:
    db = sqlite3.connect(path)
    # Anki's own case-insensitive sort order, used by its schema.
    db.create_collation('unicase', lambda a, b: (a.casefold() > b.casefold()) - (a.casefold() < b.casefold()))
    return db


def open_collection(apkg: Path, work: Path) -> sqlite3.Connection:
    with zipfile.ZipFile(apkg) as z:
        names = z.namelist()
        if 'collection.anki21b' in names:  # new format: zstd-compressed SQLite
            z.extract('collection.anki21b', work)
            out = work / 'collection.sqlite'
            subprocess.run(['node', '-e', "const z=require('zlib'),fs=require('fs');"
                            f"fs.writeFileSync({json.dumps(str(out))},z.zstdDecompressSync(fs.readFileSync({json.dumps(str(work / 'collection.anki21b'))})))"],
                           check=True)
            return connect(out)
        name = 'collection.anki21' if 'collection.anki21' in names else 'collection.anki2'
        z.extract(name, work)
        return connect(work / name)


def main() -> None:
    apkg = Path(sys.argv[1])
    with tempfile.TemporaryDirectory() as tmp:
        db = open_collection(apkg, Path(tmp))
        (ntid,) = db.execute('select id from notetypes where name = ?', (NOTE_TYPE,)).fetchone()
        fields = [name for (name,) in db.execute('select name from fields where ntid = ? order by ord', (ntid,))]
        decks = dict(db.execute('select id, name from decks'))
        rows = db.execute(
            'select n.id, n.flds, max(c.ivl), max(c.type), min(c.did) from notes n join cards c on c.nid = n.id '
            'where n.mid = ? group by n.id order by n.id', (ntid,)).fetchall()

    words = []
    for note_id, flds, ivl, ctype, did in rows:
        f = dict(zip(fields, flds.split('\x1f')))
        hanzi = plain(f.get('Hanzi', ''))
        if not hanzi:
            continue
        studied = ctype != 0
        mastery = 'new' if not studied else 'learning' if ivl < 1 else 'young' if ivl < 21 else 'mature'
        words.append({
            'noteId': note_id,
            'hanzi': hanzi,
            'pinyin': plain(f.get('Pinyin', '')),
            'english': plain(f.get('English', '')),
            'example': plain(f.get('Example', '')),
            'section': decks.get(did, '').split('\x1f')[-1],
            'interval': ivl,
            'mastery': mastery,
        })

    (ROOT / 'web/public/deck.json').write_text(json.dumps({'words': words}, ensure_ascii=False, indent=1) + '\n')
    known = [w['hanzi'] for w in words if w['mastery'] in ('young', 'mature')]
    learning = [w['hanzi'] for w in words if w['mastery'] == 'learning']
    deck = [w['hanzi'] for w in words if not re.search(r'[，。？！,.?!]', w['hanzi'])]
    (ROOT / 'content/words.json').write_text(json.dumps(
        {'known': known, 'learning': learning, 'deck': deck}, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(words)} notes: {len(known)} known, {len(learning)} learning, {len(deck)} words/phrases in the deck')


if __name__ == '__main__':
    main()
