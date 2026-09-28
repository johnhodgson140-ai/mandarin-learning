// Tone Dojo drill: 12 two-syllable words, led by my weakest tone pairs, from my Anki words + a starter list.

import { buildParagraph, type Lexicon, type Token } from '../chinese/tokens.ts'
import type { Tone } from '../chinese/tones.ts'
import { weakestPairs, type PairStat } from './toneStats.ts'

// Common HSK 1–2 words covering every tone pair, for when Anki has few two-syllable words yet.
const STARTER = [
  '今天', '飞机', '咖啡', '中国', '欢迎', '身体', '高兴', '天气', '东西', '衣服', '明天', '房间', '学习', '银行',
  '苹果', '牛奶', '学校', '朋友', '名字', '老师', '北京', '旅游', '你好', '可以', '考试', '米饭', '喜欢', '姐姐',
  '面包', '汽车', '问题', '大学', '电脑', '下午', '电视', '再见', '谢谢', '爸爸', '手机', '晚上', '足球', '比赛',
]

export type DojoItem = { word: string; token: Token; pair: [Tone, Tone] }

function toItem(word: string, lexicon: Lexicon): DojoItem | null {
  const [token] = buildParagraph([word], lexicon)
  if (!token || token.syllables.length !== 2) return null
  return { word, token, pair: [token.syllables[0].spoken, token.syllables[1].spoken] }
}

const pairKey = (p: [Tone, Tone]) => p.join('-')

export function buildDojo(lexicon: Lexicon, stats: Map<string, PairStat>, count = 12, random = Math.random): DojoItem[] {
  const fromAnki = [...lexicon].filter(([w, e]) => [...w].length === 2 && e.mastery !== 'new').map(([w]) => w)
  const pool = [...new Set([...fromAnki, ...STARTER])]
    .map((w) => toItem(w, lexicon))
    .filter((i): i is DojoItem => i !== null)
  shuffle(pool, random)

  const picked: DojoItem[] = []
  const take = (item: DojoItem) => {
    picked.push(item)
    pool.splice(pool.indexOf(item), 1)
  }

  // Up to two-thirds from my weakest pairs, taking turns between them.
  const weak = weakestPairs(stats).map(pairKey)
  for (let round = 0; picked.length < Math.ceil((count * 2) / 3) && weak.length > 0; round++) {
    let tookAny = false
    for (const key of weak) {
      const item = pool.find((i) => pairKey(i.pair) === key)
      if (item && picked.length < Math.ceil((count * 2) / 3)) {
        take(item)
        tookAny = true
      }
    }
    if (!tookAny) break
  }
  // The rest: as many different tone pairs as possible.
  while (picked.length < count && pool.length > 0) {
    const seen = new Set(picked.map((i) => pairKey(i.pair)))
    take(pool.find((i) => !seen.has(pairKey(i.pair))) ?? pool[0])
  }
  return picked
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}
