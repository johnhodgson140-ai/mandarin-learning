import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseUtterance } from '../src/grading/azureJson.ts'
import { alignToReference } from '../src/grading/grade.ts'

// Shape of Azure's detailed zh-CN pronunciation-assessment result (times in 100 ns ticks).
const sample = JSON.stringify({
  RecognitionStatus: 'Success',
  Offset: 400000,
  Duration: 11000000,
  DisplayText: '今天天气很好。',
  NBest: [
    {
      Confidence: 0.95,
      Display: '今天天气很好。',
      PronunciationAssessment: { AccuracyScore: 84, FluencyScore: 91, CompletenessScore: 100, PronScore: 87 },
      Words: [
        {
          Word: '今天', Offset: 400000, Duration: 4000000,
          PronunciationAssessment: { AccuracyScore: 98, ErrorType: 'None' },
          Syllables: [
            { Syllable: 'jin1', Offset: 400000, Duration: 2000000, PronunciationAssessment: { AccuracyScore: 100 } },
            { Syllable: 'tian1', Offset: 2400000, Duration: 2000000, PronunciationAssessment: { AccuracyScore: 96 } },
          ],
        },
        { Word: '天气', Offset: 4400000, Duration: 3000000, PronunciationAssessment: { AccuracyScore: 66, ErrorType: 'Mispronunciation' } },
        { Word: '很', Offset: 7400000, Duration: 1000000, PronunciationAssessment: { AccuracyScore: 0, ErrorType: 'Omission' } },
        { Word: '好', Offset: 8400000, Duration: 2000000, PronunciationAssessment: { AccuracyScore: 55, ErrorType: 'Mispronunciation' } },
      ],
    },
  ],
})

test('parseUtterance reads words, syllables and fluency, converting ticks to ms', () => {
  const u = parseUtterance(sample)!
  assert.equal(u.fluency, 91)
  assert.equal(u.text, '今天天气很好。')
  assert.equal(u.durationMs, 1100)
  assert.deepEqual(u.words[0], {
    word: '今天', accuracy: 98, errorType: 'None', offset: 40, duration: 400,
    syllables: [{ accuracy: 100, offset: 40, duration: 200 }, { accuracy: 96, offset: 240, duration: 200 }],
  })
  assert.equal(parseUtterance('not json'), null)
  assert.equal(parseUtterance('{}'), null)
})

test('a parsed utterance aligns onto the paragraph', () => {
  const u = parseUtterance(sample)!
  const chars = alignToReference('今天天气很好。', u.words)
  assert.deepEqual(chars.map((c) => `${c.hanzi}${c.accuracy ?? '-'}`), ['今100', '天96', '天66', '气66', '很-', '好55'])
})
