// Missions + Free Talk: Claude plays the other person; sessions are saved on the device (and Firebase when signed in).

import type Anthropic from '@anthropic-ai/sdk'
import missionPrompt from '../prompts/mission.md?raw'
import reportPrompt from '../prompts/report.md?raw'
import { correctionStyle, isPartnerReply, isReport, scenarioById, transcriptText, type Report, type Scenario, type Session, type Turn } from '../missions/logic.ts'
import { callJson } from './claude.ts'
import { currentUser, dbPut, isConfigured } from './firebase.ts'
import { load, save } from './storage.ts'
import { LEVEL_RULES } from './stories.ts'
import { learnerVocab, meetWords } from './vocab.ts'

const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply_zh', 'reply_en', 'hint_en', 'goal_achieved'],
  properties: { reply_zh: { type: 'string' }, reply_en: { type: 'string' }, hint_en: { type: 'string' }, goal_achieved: { type: 'boolean' } },
}

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['goal_achieved', 'summary_en', 'corrections', 'new_words'],
  properties: {
    goal_achieved: { type: 'boolean' },
    summary_en: { type: 'string' },
    corrections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['mine', 'better', 'why_en'],
        properties: { mine: { type: 'string' }, better: { type: 'string' }, why_en: { type: 'string' } },
      },
    },
    new_words: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'english'],
        properties: { word: { type: 'string' }, english: { type: 'string' } },
      },
    },
  },
}

/**
 * Mostly the learner's own words, a few they're learning on purpose, and at most 2–3 new words in the whole
 * conversation (the next words of their list), each made clear from context: a good way to meet new words.
 */
async function wordList(): Promise<{ rule: string; list: string }> {
  const { known, practise, upcoming } = await learnerVocab()
  if (known.length === 0) return { rule: 'Stay within HSK vocabulary for this level.', list: '' }
  return {
    rule:
      "Build your lines mainly from the learner's word list below. Work in some of the 'words to practise' naturally over the conversation. " +
      "Bring in at most 3 new words in the whole conversation, preferably from 'new words to introduce', and make each one's meaning clear from context the first time.",
    list:
      `Learner's word list (words they know or are learning):\n${known.join(' ')}\n\nWords to practise:\n${practise.join(' ') || '(none)'}` +
      (upcoming.length ? `\n\nNew words to introduce (the next ones they'll study; at most 3):\n${upcoming.map((w) => `${w.hanzi} (${w.english})`).join(', ')}` : ''),
  }
}

async function systemFor(scenario: Scenario, level: number): Promise<string> {
  const { rule, list } = await wordList()
  return missionPrompt
    .replaceAll('{{LEVEL}}', () => String(level))
    .replace('{{SETTING}}', () => scenario.setting)
    .replace('{{ROLE}}', () => scenario.role)
    .replace('{{GOAL}}', () => scenario.goal || 'none: this is a free chat.')
    .replace('{{VOCAB_RULE}}', () => rule)
    .replace('{{LEVEL_RULE}}', () => LEVEL_RULES[level])
    .replace('{{CORRECTION_STYLE}}', () => correctionStyle(level))
    .replace('{{WORD_LIST}}', () => list)
}

/** The conversation so far as API messages: Claude's turns are its earlier JSON replies. */
function messagesFor(session: Session): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: '(The conversation starts now. Say your opening line.)' }]
  for (const t of session.turns) {
    if (t.role === 'partner')
      messages.push({ role: 'assistant', content: JSON.stringify({ reply_zh: t.zh, reply_en: t.en, hint_en: t.hint, goal_achieved: session.goalAchieved }) })
    else messages.push({ role: 'user', content: t.zh })
  }
  return messages
}

async function partnerTurn(session: Session): Promise<Session> {
  const scenario = scenarioById(session.scenario)!
  const reply = await callJson({ system: await systemFor(scenario, session.level), prompt: messagesFor(session), schema: REPLY_SCHEMA, guard: isPartnerReply, maxTokens: 2000 })
  const next: Session = {
    ...session,
    turns: [...session.turns, { role: 'partner', zh: reply.reply_zh.trim(), en: reply.reply_en, hint: reply.hint_en }],
    goalAchieved: session.goalAchieved || (scenario.goal !== '' && reply.goal_achieved),
  }
  saveSession(next)
  return next
}

export function startSession(scenarioId: string, level: number): Promise<Session> {
  const session: Session = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    scenario: scenarioId,
    level,
    turns: [],
    goalAchieved: false,
    report: null,
    createdAt: Date.now(),
  }
  return partnerTurn(session)
}

/** Add what I said (and how I said it), then get the other person's reply. */
export function sendTurn(session: Session, mine: Extract<Turn, { role: 'me' }>): Promise<Session> {
  return partnerTurn({ ...session, turns: [...session.turns, mine] })
}

export async function finishSession(session: Session): Promise<Session> {
  const scenario = scenarioById(session.scenario)!
  const { list } = await wordList()
  const system = reportPrompt
    .replace('{{LEVEL}}', () => String(session.level))
    .replace('{{GOAL}}', () => scenario.goal || 'none (free chat).')
    .replace('{{WORD_LIST}}', () => list)
  const report: Report = await callJson({
    system,
    prompt: `Conversation:\n${transcriptText(session, scenario.role)}`,
    schema: REPORT_SCHEMA,
    guard: isReport,
    maxTokens: 4000,
  })
  report.corrections = report.corrections.slice(0, 3)
  const done = { ...session, report }
  saveSession(done)
  // New words from the conversation join my words: they come back as tomorrow's new words.
  await meetWords(report.new_words.map((w) => w.word)).catch(() => 0)
  return done
}

const KEEP = 30

export function saveSession(session: Session): void {
  const others = load<Session[]>('sessions', []).filter((s) => s.id !== session.id)
  save('sessions', [session, ...others].slice(0, KEEP))
  if (isConfigured && currentUser()) void dbPut(`sessions/${session.id}`, session).catch(() => {})
}
