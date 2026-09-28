// Daily content written each morning by a scheduled Claude session (docs/DAILY.md) and served as
// web/public/daily/latest.json. No API key needed to use it. validateDaily() is run by the tests, so a bad
// file fails CI and never gets deployed.

export type DailyStory = {
  id: string
  level: number
  topic: string
  title_zh: string
  title_en: string
  /** Each paragraph split into words, punctuation as separate items. */
  paragraphs: string[][]
  /** Natural English for each paragraph, same order. */
  translations: string[]
  names: string[]
  new_words: string[]
  glossary: { word: string; english: string }[]
}

export type GuidedStep = {
  partner_zh: string
  partner_en: string
  /** What I should say, in English. */
  prompt_en: string
  /** 2–3 natural answers; I'm scored against the closest one. */
  answers_zh: string[]
}

export type GuidedMission = {
  id: string
  level: number
  title: string
  role: string
  goal: string
  steps: GuidedStep[]
  closing_zh: string
  closing_en: string
}

export type PlanItem = { kind: 'cards' | 'dojo' | 'story' | 'mission' | 'free'; title_en: string; ref?: string }

export type DailyContent = {
  date: string
  level: number
  plan: { focus_en: string; items: PlanItem[] }
  stories: DailyStory[]
  missions: GuidedMission[]
}

const HAN = /\p{Script=Han}/u
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Every problem in a daily file (empty list = valid). */
export function validateDaily(v: unknown): string[] {
  const errors: string[] = []
  const d = v as Partial<DailyContent> | null
  if (!d || typeof d !== 'object') return ['not an object']
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) errors.push('date must be YYYY-MM-DD')
  if (!Number.isInteger(d.level) || (d.level ?? 0) < 1 || (d.level ?? 0) > 6) errors.push('level must be 1–6')
  if (!d.plan || !isStr(d.plan.focus_en) || !Array.isArray(d.plan.items) || d.plan.items.length === 0) errors.push('plan needs focus_en and items')
  const stories = Array.isArray(d.stories) ? d.stories : []
  const missions = Array.isArray(d.missions) ? d.missions : []
  if (stories.length === 0) errors.push('at least one story')
  const ids = new Set<string>()
  stories.forEach((s, i) => {
    const at = `stories[${i}]`
    if (!isStr(s.id) || ids.has(s.id)) errors.push(`${at}.id missing or duplicate`)
    ids.add(s.id)
    if (!isStr(s.title_zh) || !isStr(s.title_en) || !isStr(s.topic)) errors.push(`${at} needs title_zh, title_en, topic`)
    if (!Array.isArray(s.paragraphs) || s.paragraphs.length === 0) errors.push(`${at}.paragraphs empty`)
    else
      s.paragraphs.forEach((p, j) => {
        if (!Array.isArray(p) || p.length === 0 || !p.every(isStr)) errors.push(`${at}.paragraphs[${j}] must be non-empty words`)
        else if (p.some((w) => /\s/.test(w))) errors.push(`${at}.paragraphs[${j}] words must not contain spaces`)
        else if (!p.some((w) => HAN.test(w))) errors.push(`${at}.paragraphs[${j}] has no Chinese`)
        else if (p.some((w) => /[a-zāáǎàēéěèīíǐìōóǒòūúǔù]/i.test(w))) errors.push(`${at}.paragraphs[${j}] must not contain pinyin or Latin letters`)
      })
    if (!Array.isArray(s.translations) || !Array.isArray(s.paragraphs) || s.translations.length !== s.paragraphs.length || !s.translations.every(isStr))
      errors.push(`${at}.translations needs one English line per paragraph`)
    if (!Array.isArray(s.names) || !Array.isArray(s.new_words) || !Array.isArray(s.glossary)) errors.push(`${at} needs names, new_words, glossary arrays`)
    else if (!s.glossary.every((g) => isStr(g?.word) && isStr(g?.english))) errors.push(`${at}.glossary entries need word + english`)
  })
  missions.forEach((m, i) => {
    const at = `missions[${i}]`
    if (!isStr(m.id) || ids.has(m.id)) errors.push(`${at}.id missing or duplicate`)
    ids.add(m.id)
    if (![m.title, m.role, m.goal, m.closing_zh, m.closing_en].every(isStr)) errors.push(`${at} needs title, role, goal, closing_zh, closing_en`)
    if (!Array.isArray(m.steps) || m.steps.length < 3 || m.steps.length > 8) errors.push(`${at} needs 3–8 steps`)
    else
      m.steps.forEach((st, j) => {
        if (![st.partner_zh, st.partner_en, st.prompt_en].every(isStr)) errors.push(`${at}.steps[${j}] needs partner_zh, partner_en, prompt_en`)
        if (!Array.isArray(st.answers_zh) || st.answers_zh.length < 1 || !st.answers_zh.every((a) => isStr(a) && HAN.test(a)))
          errors.push(`${at}.steps[${j}].answers_zh needs 1–3 Chinese answers`)
      })
  })
  for (const item of d.plan?.items ?? []) {
    if (!['cards', 'dojo', 'story', 'mission', 'free'].includes(item.kind) || !isStr(item.title_en)) errors.push(`plan item "${item.title_en}" is invalid`)
    if ((item.kind === 'story' || item.kind === 'mission') && !ids.has(item.ref ?? '')) errors.push(`plan item "${item.title_en}" refers to unknown id ${item.ref}`)
  }
  return errors
}

export const isDaily = (v: unknown): v is DailyContent => validateDaily(v).length === 0
