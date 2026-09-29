// Readings for one-character words whose pronunciation depends on the words around them, where pinyin-pro guesses
// wrong: 踢得很好 (de, not dé), 慢慢地 (de, not dì), 拿着 (zhe, not zhuó), 只穿过 (zhǐ, not zhī), 教她 (jiāo, not jiào).
// Each rule looks only at the neighbouring words; null means "keep pinyin-pro's reading".

const HAN = /\p{Script=Han}/u
const han = (w: string | undefined) => !!w && HAN.test(w)
const last = (w: string | undefined) => (w ? [...w].at(-1) ?? '' : '')

/** Words before 得 that mean "must" (děi) or "get" (dé), not the 踢得好 particle. */
const DEI_BEFORE = new Set([...'我你您他她它们总就还也都可又才必须只并不'])
/** 地 after these is the ground/place (一块地, 这片地), not the 慢慢地 particle. */
const DI_BEFORE = new Set([...'的块片个这那此各本外当在到满遍土草田空陆大天落种扫拖躺跪摔'])
/** Before 只 as a measure word (一只猫, 那只, 几只). */
const ZHI_MEASURE = new Set([...'一二三四五六七八九十两几这那哪每半'])
/** 为 is wéi (as / into) after these (转化为, 称为) and before these (为主, 为止). */
const WEI_AFTER = new Set([...'化成作称改变分选视认列定评'])
const WEI_BEFORE = new Set([...'主止难首期'])
/** 以 ending a word (可以, 所以, 难以) doesn't start 以……为……. */
const YI_WORD_END = new Set([...'可所难足得加予用'])
/** 重 before these means "again" (重看, 重来). */
const CHONG_BEFORE = new Set([...'看来做写读播听说'])

export function contextReading(words: readonly string[], i: number): string | null {
  const word = words[i]
  const prev = words[i - 1]
  const next = words[i + 1]
  switch (word) {
    case '得':
      // 看得见, 踢得很好, 变得更好: a particle after a verb or adjective.
      if (han(prev) && !DEI_BEFORE.has(last(prev))) return 'de'
      return null
    case '地':
      // 慢慢地走, 慢慢地，…: an adverb marker; the ground after 的/块/扫… or at the start.
      return han(prev) && !DI_BEFORE.has(last(prev)) ? 'de' : 'dì'
    case '着':
      // 睡不着, 找得着: "manage to"; everywhere else after a verb it's the ongoing 着.
      if (last(prev) === '不' || last(prev) === '得' || last(prev) === '没') return 'zháo'
      // 睡着了: fell asleep.
      if (last(prev) === '睡' && next?.startsWith('了')) return 'zháo'
      return han(prev) ? 'zhe' : null
    case '只':
      return ZHI_MEASURE.has(last(prev)) ? 'zhī' : 'zhǐ'
    case '教':
      return 'jiāo'
    case '长':
      // 长大 grow up, 长得很高 looks tall; otherwise long (排长队, 一年比一年长).
      return next?.startsWith('大') || next?.startsWith('得') ? 'zhǎng' : 'cháng'
    case '觉':
      // 睡觉, 睡不着觉, 午觉: sleep.
      return ['睡', '着', '午', '个'].includes(last(prev)) ? 'jiào' : null
    case '重':
      // 重看, 重来: again. Heavy otherwise.
      return CHONG_BEFORE.has([...(next ?? '')][0] ?? '') ? 'chóng' : null
    case '相':
      // 照了一张相: a photo.
      return last(prev) === '张' ? 'xiàng' : null
    case '为':
      // "As / into": 转化为, 称为, 以历史为题材, 为主, 为止. "For" (wèi) everywhere else: 为你, 可以为足球服务.
      if (WEI_AFTER.has(last(prev))) return 'wéi'
      if (WEI_BEFORE.has([...(next ?? '')][0] ?? '')) return 'wéi'
      // 以 must start the phrase (以历史为), not end a word (可以为 = can … for).
      if (words.slice(Math.max(0, i - 6), i - 1).some((w, j, before) => w === '以' && !YI_WORD_END.has(last(before[j - 1])))) return 'wéi'
      return 'wèi'
    case '应':
      // 应该, 应收: should (答应, 反应 are whole words).
      return 'yīng'
    default:
      return null
  }
}
