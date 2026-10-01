// Builds web/public/daily-words.json: the built-in word list for Today's words (app, notifications and widget).
// HSK 1 → 6 from hsk.json, the most common words first within each level, with the app's own pinyin (dictionary
// corrections, neutral tones, 一/不 as said) and a short meaning. Nothing to do with Anki, so it never runs out
// (5,500+ words) and the widget, which reads this file from the app, always shows the same words as the app.
// Run: cd web && npm run daily-list   (the tests check the output)

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildParagraph, pinyinLine } from '../src/chinese/tokens.ts'

const web = join(import.meta.dirname, '..')
const hsk: Record<string, [number, number, string]> = JSON.parse(readFileSync(join(web, 'public', 'hsk.json'), 'utf8')).words

/** A short meaning a learner can use: dictionary notes dropped ("used in…", "variant of…", "surname…"), "(bound form) up" → "up". */
export function shortMeaning(raw: string): string {
  const senses = raw
    .split(/;\s*/)
    .map((s) => s.trim())
    .map((s) => s.replace(/\s*\((Taiwan pr|also pr|Tw|variant of)[^)]*\)/gi, '').trim())
    .filter((s) => s && !/^(used in|variant of|old variant|surname|see |also written|erhua variant|Taiwan pr\.)/i.test(s) && !/abbr\.|variant of/i.test(s))
    .map((s) => (/^\([^)]*\)$/.test(s) ? s.slice(1, -1) : s.replace(/^\((bound form|literary|coll\.|colloquial|dialect|old|formal|classifier)[^)]*\)\s*/i, '')))
    .filter((s) => s && !s.startsWith('('))
  const out = senses.slice(0, 2).join('; ')
  return out.length > 48 ? senses[0].slice(0, 48) : out
}

/** Hand-written meanings where the dictionary's first senses mislead a learner (要 "to coerce", 比 "Belgium"). */
const MEANINGS: Record<string, string> = {
  的: 'of; \u2019s (possessive particle)', 了: 'done (completed action); now (change)', 是: 'to be; yes', 你: 'you',
  在: 'at; in; (doing) now', 不: 'not; no', 这: 'this; these', 就: 'then; just; right away', 个: 'general measure word (一个人)',
  和: 'and; with', 说: 'to speak; to say', 要: 'to want; will; need to', 会: 'can; will; meeting', 也: 'also; too',
  很: 'very', 还: 'still; also; even more', 着: 'ongoing action (坐着 sitting)', 想: 'to think; to want; to miss',
  给: 'to give; for', 那: 'that; those', 看: 'to look; to watch; to read', 吧: 'suggestion particle (走吧 let\u2019s go)',
  点: 'o\u2019clock; a little; dot', 过: 'to pass; (have) done before', 没: 'not (have); didn\u2019t', 中: 'middle; China; in',
  里: 'inside; in', 年: 'year', 等: 'to wait; etc.', 吗: 'yes/no question particle', 太: 'too (much); very',
  呢: 'and…? (question particle); ongoing', 次: 'time (occurrence); next', 后: 'after; behind', 地: 'ground; -ly (慢慢地)',
  跟: 'with; to follow', 谁: 'who', 打: 'to hit; to make (a call); to play', 快: 'fast; soon', 比: 'than; to compare',
  话: 'words; speech', 还是: 'or (in questions); still; had better', 一起: 'together', 几: 'how many; a few', 听: 'to listen; to hear',
  开: 'to open; to drive; to start', 叫: 'to be called; to call; to shout', 别: 'don\u2019t; other', 本: 'measure word for books; origin',
  回: 'to go back; time (occurrence)', 东西: 'thing; stuff', 告诉: 'to tell', 地方: 'place', 老: 'old; always',
  行: 'OK; to walk', 号: 'number; date (of month)', 正: 'just (now); straight', 先: 'first; before', 准备: 'to prepare; ready',
  进: 'to enter; to go in', 分: 'minute; point; to divide', 女人: 'woman', 日: 'day; sun', 站: 'station; to stand',
  男人: 'man', 正在: 'in the middle of (doing)', 喝: 'to drink', 们: 'plural for people (我们, 你们)', 干: 'to do; dry',
  块: 'piece; kuai (yuan)', 妈: 'mum', 多少: 'how many; how much', 间: 'room; between', 哪: 'which', 男: 'male',
  动: 'to move', 重: 'heavy; important', 真的: 'really; true', 子: 'child; (noun suffix)', 元: 'yuan (money)',
  包: 'bag; to wrap', 楼: 'building; floor', 大学: 'university', 热: 'hot', 西: 'west', 第: 'ordinal prefix (第一 first)',
  差: 'bad; to be short of', 教: 'to teach', 读: 'to read; to study', 常: 'often', 关: 'to close; to turn off',
  风: 'wind', 累: 'tired', 班: 'class; shift', 毛: 'hair; 10 cents', 东: 'east', 家人: 'family', 同学: 'classmate',
  车上: 'in the car', 考: 'to take an exam', 页: 'page', 知识: 'knowledge', 奶: 'milk', 奶奶: 'grandma (father\u2019s mother)',
  爷爷: 'grandpa (father\u2019s father)', 有的: 'some', 一边: 'while (一边…一边); one side', 页面: 'page', 树: 'tree',
  早上: 'morning', 上午: 'morning (before noon)', 我: 'I; me', 有: 'to have; there is', 对: 'right; correct; to; towards',
  到: 'to arrive; to; until', 上: 'up; on; to go to', 下: 'down; under; next', 用: 'to use', 天: 'day; sky',
  出: 'to go out; to come out', 事: 'thing; matter', 家: 'home; family', 前: 'front; before', 跑: 'to run',
  起: 'to rise; to get up', 见: 'to see; to meet', 手: 'hand', 钱: 'money', 问: 'to ask', 岁: 'years old',
  放: 'to put; to let go', 高: 'tall; high', 水: 'water', 送: 'to give (as a gift); to send; to see off',
  路: 'road; way', 门: 'door', 花: 'flower; to spend', 早: 'early', 外: 'outside', 学: 'to learn; to study',
  难: 'difficult', 晚: 'late; evening', 书: 'book', 先生: 'Mr; sir; husband', 口: 'mouth', 杯: 'cup; glass',
  歌: 'song', 白: 'white', 试: 'to try', 票: 'ticket', 字: 'character (written); word', 关系: 'relationship; connection',
  打开: 'to open', 一会儿: 'a moment; a little while', 干什么: 'what are (you) doing?', 是不是: 'is it…?; isn\u2019t it?',
}

const HAN = /^\p{Script=Han}{1,4}$/u
const words = Object.entries(hsk)
  .filter(([w, [level]]) => level <= 6 && HAN.test(w))
  .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1])
  .flatMap(([w, [, , meaning]]) => {
    const english = MEANINGS[w] ?? shortMeaning(meaning)
    if (!english) return []
    const pinyin = pinyinLine(buildParagraph([w], new Map()))
    return pinyin ? [[w, pinyin, english]] : []
  })

writeFileSync(join(web, 'public', 'daily-words.json'), JSON.stringify({ words }))
console.log(`${words.length} words → public/daily-words.json`)
