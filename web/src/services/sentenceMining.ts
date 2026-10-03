// A fallback example sentence from the stories on this device or in the ready-made pack (no English: the
// curated sentences in sentences.json have it). Pure, so it's tested.

const SENTENCE_END = /^[。！？!?]+$/u

/** The shortest sentence (4–24 characters) with `word` as a whole word, from stories split into words. */
export function mineSentence(word: string, stories: string[][][]): string | null {
  let best: string | null = null
  for (const paragraphs of stories)
    for (const words of paragraphs) {
      let start = 0
      for (let i = 0; i < words.length; i++) {
        if (!SENTENCE_END.test(words[i]) && i < words.length - 1) continue
        const sentence = words.slice(start, i + 1)
        start = i + 1
        if (!sentence.includes(word)) continue
        const text = sentence.join('').replace(/^[“”"‘’「」：:，,\s]+/u, '')
        const n = [...text].length
        if (n >= 4 && n <= 24 && !/[“”"「」]/u.test(text) && (best === null || n < [...best].length)) best = text
      }
    }
  return best
}
