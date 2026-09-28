// Common HSK 1–2 words so there's always something to practise (not only my Anki cards).
import type { Card } from './srs.ts'

const WORDS: [string, string][] = [
  ['你好', 'hello'], ['谢谢', 'thank you'], ['再见', 'goodbye'], ['朋友', 'friend'], ['老师', 'teacher'], ['学生', 'student'],
  ['中国', 'China'], ['今天', 'today'], ['明天', 'tomorrow'], ['昨天', 'yesterday'], ['现在', 'now'], ['时候', 'time; when'],
  ['喜欢', 'to like'], ['学习', 'to study'], ['工作', 'work; to work'], ['吃饭', 'to eat a meal'], ['喝', 'to drink'], ['水', 'water'],
  ['茶', 'tea'], ['咖啡', 'coffee'], ['米饭', 'cooked rice'], ['饭店', 'restaurant; hotel'], ['商店', 'shop'], ['医院', 'hospital'],
  ['飞机', 'plane'], ['出租车', 'taxi'], ['火车站', 'train station'], ['地铁', 'subway'], ['多少钱', 'how much?'], ['便宜', 'cheap'],
  ['贵', 'expensive'], ['衣服', 'clothes'], ['漂亮', 'pretty'], ['买', 'to buy'], ['卖', 'to sell'], ['看', 'to look; watch'],
  ['听', 'to listen'], ['说话', 'to speak'], ['读', 'to read'], ['写', 'to write'], ['电脑', 'computer'], ['手机', 'mobile phone'],
  ['电视', 'television'], ['电影', 'film'], ['足球', 'football'], ['比赛', 'match; competition'], ['运动', 'sport; exercise'], ['天气', 'weather'],
  ['下雨', 'to rain'], ['高兴', 'happy'], ['累', 'tired'], ['忙', 'busy'], ['知道', 'to know'], ['认识', 'to know (a person)'],
  ['觉得', 'to feel; think'], ['可以', 'can; may'], ['想', 'to want; think'], ['去', 'to go'], ['来', 'to come'], ['回家', 'to go home'],
]

export const STARTER_CARDS: Card[] = WORDS.map(([hanzi, english]) => ({ hanzi, english, source: 'app' }))
