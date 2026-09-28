import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  correctionStyle, isPartnerReply, isReport, pronunciationSummary, scenarioById, SCENARIOS, transcriptText, type Session,
} from '../src/missions/logic.ts'

test('eight scenarios with goals, plus Free Talk', () => {
  assert.equal(SCENARIOS.length, 8)
  assert.ok(SCENARIOS.every((s) => s.goal && s.role && s.setting))
  assert.equal(scenarioById('free')?.goal, '')
  assert.equal(scenarioById('nope'), undefined)
})

test('reply and report guards', () => {
  assert.ok(isPartnerReply({ reply_zh: '你好！', reply_en: 'Hi!', hint_en: 'Say hello', goal_achieved: false }))
  assert.ok(!isPartnerReply({ reply_zh: ' ', reply_en: '', hint_en: '', goal_achieved: false }))
  assert.ok(!isPartnerReply({ reply_zh: '你好', reply_en: 'Hi' }))
  assert.ok(isReport({ goal_achieved: true, summary_en: 'Good', corrections: [{ mine: '我去了', better: '我去过', why_en: 'experience' }], new_words: [] }))
  assert.ok(!isReport({ goal_achieved: true, summary_en: 'Good', corrections: [{ mine: 'x' }], new_words: [] }))
})

const session: Session = {
  id: 's', scenario: 'restaurant', level: 1, goalAchieved: false, report: null, createdAt: 0,
  turns: [
    { role: 'partner', zh: '您好，几位？', en: 'Hello, how many?', hint: '' },
    { role: 'me', zh: '一位。', pron: { accuracy: 90, fluency: 80, words: [{ word: '一位', accuracy: 90 }] } },
    { role: 'partner', zh: '想吃什么？', en: 'What would you like?', hint: '' },
    { role: 'me', zh: '我要饺子和可乐。', pron: { accuracy: 70, fluency: 60, words: [{ word: '我', accuracy: 95 }, { word: '要', accuracy: 50 }, { word: '饺子', accuracy: 65 }, { word: '和', accuracy: 90 }, { word: '可乐', accuracy: 40 }] } },
    { role: 'me', zh: '(typed)', pron: null },
  ],
}

test('transcript text labels the speakers', () => {
  assert.equal(transcriptText(session, '服务员').split('\n')[0], 'Partner (服务员): 您好，几位？')
  assert.equal(transcriptText(session, '服务员').split('\n')[1], 'Learner: 一位。')
})

test('pronunciation summary: character-weighted accuracy, mean fluency, weakest words', () => {
  // chars: 一位 2×90, 我 95, 要 50, 饺子 2×65, 和 90, 可乐 2×40 → 745 / 9
  assert.deepEqual(pronunciationSummary(session.turns), { accuracy: 69, fluency: 70, practise: ['可乐', '要', '饺子'] })
  assert.equal(pronunciationSummary([{ role: 'me', zh: 'x', pron: null }]), null)
})

test('correction style changes at level 3', () => {
  assert.match(correctionStyle(2), /recast/)
  assert.match(correctionStyle(3), /correct it briefly/)
})
