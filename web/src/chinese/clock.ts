// The time said the way it's said in Mandarin: 下午三点二十 · xiàwǔ sān diǎn èrshí.
// Mirrored in Swift for the lock screen widget (web/ios/App/ShuoWidgets/ChineseTime.swift): keep them in step.

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const DIGITS_PY = ['líng', 'yī', 'èr', 'sān', 'sì', 'wǔ', 'liù', 'qī', 'bā', 'jiǔ']

/** 1–59 in characters and pinyin (十, 十五, 二十, 三十五…). */
export function number(n: number): { hanzi: string; pinyin: string } {
  if (n < 10) return { hanzi: DIGITS[n], pinyin: DIGITS_PY[n] }
  const tens = Math.floor(n / 10)
  const ones = n % 10
  const hanzi = (tens > 1 ? DIGITS[tens] : '') + '十' + (ones ? DIGITS[ones] : '')
  // A syllable starting with a vowel after another one takes an apostrophe: shí'èr.
  const pinyin = (tens > 1 ? DIGITS_PY[tens] : '') + 'shí' + (ones ? (ones === 2 ? "'" : '') + DIGITS_PY[ones] : '')
  return { hanzi, pinyin }
}

/** Part of the day, as it's said before the time. */
function period(hour: number): { hanzi: string; pinyin: string } {
  if (hour < 5) return { hanzi: '凌晨', pinyin: 'língchén' }
  if (hour < 9) return { hanzi: '早上', pinyin: 'zǎoshang' }
  if (hour < 12) return { hanzi: '上午', pinyin: 'shàngwǔ' }
  if (hour < 13) return { hanzi: '中午', pinyin: 'zhōngwǔ' }
  if (hour < 18) return { hanzi: '下午', pinyin: 'xiàwǔ' }
  return { hanzi: '晚上', pinyin: 'wǎnshang' }
}

export function chineseTime(hour: number, minute: number): { hanzi: string; pinyin: string } {
  const p = period(hour)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const h = h12 === 2 ? { hanzi: '两', pinyin: 'liǎng' } : number(h12) // 两点, not 二点
  let m = { hanzi: '', pinyin: '' }
  if (minute === 30) m = { hanzi: '半', pinyin: ' bàn' }
  else if (minute > 0 && minute < 10) m = { hanzi: `零${DIGITS[minute]}分`, pinyin: ` líng ${DIGITS_PY[minute]} fēn` }
  else if (minute >= 10) m = { hanzi: number(minute).hanzi, pinyin: ` ${number(minute).pinyin}` }
  return { hanzi: `${p.hanzi}${h.hanzi}点${m.hanzi}`, pinyin: `${p.pinyin} ${h.pinyin} diǎn${m.pinyin}` }
}
