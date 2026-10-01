// What to write with, for AI stories and live missions: mostly words I've met (comprehensible input), a few I'm
// learning right now woven in on purpose, and a couple of brand-new ones from the next words of my list (so stories
// and missions preview what I'm about to learn).
import { curriculumList, myWords, saveMine, todaysWords, type Word } from './curriculum.ts'
import { dayNumber } from '../notify/plan.ts'
import { getLexicon } from './words.ts'

/** Below this many words, there isn't enough to write with: the most common words of the list are allowed too. */
const BASICS = 150

export type Vocab = {
  /** Words to write with. */
  known: string[]
  /** Today's words and words I'm still shaky on: use some of these on purpose. */
  practise: string[]
  /** The next words of my list: the new words to prefer (a few at most). */
  upcoming: Word[]
}

export async function learnerVocab(): Promise<Vocab> {
  const lexicon = getLexicon()
  const list = await curriculumList()
  const rated = [...lexicon].filter(([, e]) => e.mastery !== 'new').map(([w]) => w)
  const known = rated.length >= BASICS ? rated : [...new Set([...rated, ...list.slice(0, BASICS).map((w) => w.hanzi)])]
  const today = (await todaysWords()).map((w) => w.hanzi)
  const shaky = [...lexicon].filter(([, e]) => e.mastery === 'learning').map(([w]) => w)
  const practise = [...new Set([...today, ...shaky])].slice(0, 12)
  const mine = myWords()
  const upcoming = list.filter((w) => !mine[w.hanzi] && !known.includes(w.hanzi)).slice(0, 20)
  return { known, practise, upcoming }
}

/**
 * Words I came across in a mission or story: they join my words (met today), so tomorrow's words start with them
 * (Today's words carries over met-but-unrated words first). A word of the list takes the list's pinyin and meaning;
 * any other word needs its own (`fallback`, e.g. from the reader's word sheet), else it's left out.
 */
export async function meetWords(hanzi: string[], fallback: Record<string, Word> = {}): Promise<number> {
  const list = new Map((await curriculumList()).map((w) => [w.hanzi, w]))
  const mine = myWords()
  const day = dayNumber(new Date())
  let added = 0
  for (const h of hanzi) {
    const w = list.get(h) ?? (fallback[h]?.english ? fallback[h] : undefined)
    if (w && !mine[h]) {
      mine[h] = { ...w, day }
      added++
    }
  }
  if (added) saveMine(mine)
  return added
}
