"""Build web/public/hsk.json from the complete HSK vocabulary (github.com/drkameleon/complete-hsk-vocabulary, MIT;
meanings from CC-CEDICT, CC BY-SA 4.0).

Usage: python3 scripts/build_hsk.py path/to/complete.min.json

Output: {"words": {"爱好": [level, frequency_rank, "meaning; meaning"], ...}} where level is the HSK 3.0 level
(1–6, 7 = the 7–9 band), falling back to the old HSK 2.0 level; frequency rank: lower = more common.
"""

import json
import sys


def level_of(codes):
    for prefix in ("n", "t", "o"):  # HSK 3.0, newest revision, HSK 2.0
        levels = [int(c[1:]) for c in codes if c.startswith(prefix) and c[1:].isdigit()]
        if levels:
            return min(levels)
    return None


def main(src):
    entries = json.load(open(src, encoding="utf-8"))
    words = {}
    for e in entries:
        level = level_of(e.get("l", []))
        if level is None:
            continue
        meanings = []
        for form in e.get("f", []):
            for m in form.get("m", []):
                m = m.strip()
                if m and m not in meanings and not m.startswith(("variant of", "old variant", "see ", "surname ")):
                    meanings.append(m)
        meaning = "; ".join(meanings[:3])
        if len(meaning) > 90:
            meaning = meaning[:87].rsplit(" ", 1)[0] + "…"
        word = e["s"]
        if word not in words or level < words[word][0]:
            words[word] = [level, e.get("q", 99999), meaning]
    out = {"source": "complete-hsk-vocabulary (MIT) · meanings: CC-CEDICT (CC BY-SA 4.0)", "words": words}
    with open("web/public/hsk.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    by_level = {}
    for w, (lvl, _, _) in words.items():
        by_level[lvl] = by_level.get(lvl, 0) + 1
    print(f"{len(words)} words", dict(sorted(by_level.items())))


if __name__ == "__main__":
    main(sys.argv[1])
