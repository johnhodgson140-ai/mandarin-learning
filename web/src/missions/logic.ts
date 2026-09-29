// Missions + Free Talk: scenarios, turn/report shapes and the pure bits (no network, no DOM).

export type Scenario = {
  id: string
  title: string
  /** Who Claude plays, as shown above its lines. */
  role: string
  /** What I have to achieve; empty for Free Talk. */
  goal: string
  /** Scene description for Claude. */
  setting: string
}

export const SCENARIOS: Scenario[] = [
  { id: 'restaurant', title: 'Restaurant', role: '服务员', goal: 'Order a main dish and a drink, then ask for the bill.', setting: 'A small, busy restaurant in Shanghai. You are the waiter.' },
  { id: 'taxi', title: 'Taxi', role: '司机', goal: 'Tell the driver where you are going and ask how long it will take.', setting: 'A taxi in Beijing. You are the driver; the learner has just got in.' },
  { id: 'hotel', title: 'Hotel check-in', role: '前台', goal: 'Check in with your name and ask what time breakfast is.', setting: 'The front desk of a hotel in Chengdu. You are the receptionist.' },
  { id: 'shopping', title: 'Shopping', role: '店员', goal: 'Buy a T-shirt in your size and a colour you like, and pay.', setting: 'A clothes shop in a Shenzhen mall. You are the shop assistant.' },
  { id: 'bargaining', title: 'Bargaining', role: '摊主', goal: 'Get the price of a jacket down by at least 20%.', setting: 'A market stall in Guangzhou. You sell jackets, start at 300 yuan and bargain realistically.' },
  { id: 'directions', title: 'Asking directions', role: '路人', goal: 'Find out how to get to the nearest metro station and how far it is.', setting: 'A street corner in Hangzhou. You are a friendly local passer-by.' },
  { id: 'xianyu', title: 'Xianyu seller', role: '卖家', goal: "Ask about a used Dior Homme jacket's size and condition, and agree a price.", setting: 'A Xianyu (闲鱼) chat. You are selling a second-hand Dior Homme jacket (2006, size 46, good condition) for 1800 yuan. Write like a real seller messaging: short and casual.' },
  { id: 'football', title: 'Football chat', role: '球迷', goal: "Chat about last weekend's match and say which team you support and why.", setting: 'A bar showing football. You are a fan who loves the Premier League and Chinese Super League.' },
]

export const FREE_TALK: Scenario = {
  id: 'free',
  title: 'Free Talk',
  role: '朋友',
  goal: '',
  setting: 'You are a friendly Chinese friend chatting over coffee. Keep the conversation going with one simple question each turn, about their life, studies or interests.',
}

export const scenarioById = (id: string) => (id === 'free' ? FREE_TALK : SCENARIOS.find((s) => s.id === id))

/** Claude's reply for one turn. */
export type PartnerReply = { reply_zh: string; reply_en: string; hint_en: string; goal_achieved: boolean }

export type Report = {
  goal_achieved: boolean
  summary_en: string
  corrections: { mine: string; better: string; why_en: string }[]
  new_words: { word: string; english: string }[]
}

export type Turn =
  | { role: 'partner'; zh: string; en: string; hint: string }
  | { role: 'me'; zh: string; pron: { accuracy: number; fluency: number | null; words: { word: string; accuracy: number }[] } | null }

export type Session = {
  id: string
  scenario: string
  level: number
  turns: Turn[]
  goalAchieved: boolean
  report: Report | null
  createdAt: number
}

const str = (v: unknown): v is string => typeof v === 'string'

export function isPartnerReply(v: unknown): v is PartnerReply {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return str(r.reply_zh) && r.reply_zh.trim().length > 0 && str(r.reply_en) && str(r.hint_en) && typeof r.goal_achieved === 'boolean'
}

export function isReport(v: unknown): v is Report {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.goal_achieved === 'boolean' &&
    str(r.summary_en) &&
    Array.isArray(r.corrections) &&
    r.corrections.every((c) => c && str(c.mine) && str(c.better) && str(c.why_en)) &&
    Array.isArray(r.new_words) &&
    r.new_words.every((w) => w && str(w.word) && str(w.english))
  )
}

/** The conversation as plain lines for the report prompt. */
export function transcriptText(session: Session, role: string): string {
  return session.turns.map((t) => `${t.role === 'me' ? 'Learner' : `Partner (${role})`}: ${t.zh}`).join('\n')
}

/** Pronunciation over all my turns: character-weighted accuracy, mean fluency, and the weakest words. */
const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function pronunciationSummary(turns: Turn[]): { accuracy: number; fluency: number | null; practise: string[] } | null {
  const mine = turns.flatMap((t) => (t.role === 'me' && t.pron ? [t.pron] : []))
  if (mine.length === 0) return null
  let chars = 0
  let weighted = 0
  for (const p of mine)
    for (const w of p.words) {
      const n = [...w.word].length
      chars += n
      weighted += w.accuracy * n
    }
  const practise = [
    ...new Set(
      mine
        .flatMap((p) => p.words)
        .filter((w) => w.accuracy < 70)
        .sort((a, b) => a.accuracy - b.accuracy)
        .map((w) => w.word),
    ),
  ].slice(0, 5)
  return {
    accuracy: chars ? Math.round(weighted / chars) : 0,
    // Fluency needs Azure; turns scored on the phone alone have none.
    fluency: average(mine.flatMap((p) => (p.fluency === null ? [] : [p.fluency]))),
    practise,
  }
}

/** Correction style by level (docs/SPEC.md §8): gentle recast at 1–2, explicit from 3. */
export const correctionStyle = (level: number) =>
  level <= 2
    ? 'If the learner makes a mistake, recast: naturally repeat what they meant, correctly, inside your reply. Never lecture.'
    : 'If the learner makes a clear mistake, first correct it briefly in simple Chinese (e.g. “应该说：…”), then carry on in character.'
