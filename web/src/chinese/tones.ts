export type Tone = 1 | 2 | 3 | 4 | 5

const TONE_MARKS: Record<string, Tone> = {}
for (const [tone, chars] of [[1, 'āēīōūǖĀĒĪŌŪǕ'], [2, 'áéíóúǘÁÉÍÓÚǗ'], [3, 'ǎěǐǒǔǚǍĚǏǑǓǙ'], [4, 'àèìòùǜÀÈÌÒÙǛ']] as const) {
  for (const c of chars) TONE_MARKS[c] = tone
}

/** Tone 1–4 from the tone mark in a pinyin syllable; 5 (neutral) when there is none. */
export function toneOf(syllable: string): Tone {
  for (const c of syllable.normalize('NFC')) {
    const tone = TONE_MARKS[c]
    if (tone) return tone
  }
  return 5
}

const PLAIN: Record<string, string> = {}
for (const [base, marked] of [['a', 'āáǎà'], ['e', 'ēéěè'], ['i', 'īíǐì'], ['o', 'ōóǒò'], ['u', 'ūúǔù'], ['ü', 'ǖǘǚǜ']] as const) {
  for (const c of marked) PLAIN[c] = base
}

/** Pinyin letters only: no tone marks, spaces or apostrophes, lower case (ü kept). */
export function toneless(pinyin: string): string {
  return [...pinyin.normalize('NFC').toLowerCase()]
    .map((c) => PLAIN[c] ?? c)
    .join('')
    .replace(/[^a-zü]/g, '')
}

const MARKED: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }

/** Put a tone mark on tone-less pinyin letters ("hao", 3 → "hǎo"): a/e first, then the o of "ou", else the last vowel. */
export function markTone(letters: string, tone: Tone): string {
  const s = letters.replace(/v/g, 'ü')
  if (tone === 5) return s
  let at = s.search(/[ae]/)
  if (at < 0) at = s.indexOf('ou')
  if (at < 0) for (let i = s.length - 1; i >= 0; i--) if ('iouü'.includes(s[i])) { at = i; break }
  if (at < 0) return s
  return s.slice(0, at) + MARKED[s[at]][tone - 1] + s.slice(at + 1)
}

const HAN = /\p{Script=Han}/u
export const isHan = (char: string) => HAN.test(char)
