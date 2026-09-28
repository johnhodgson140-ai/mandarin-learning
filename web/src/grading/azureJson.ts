// Parse one Azure Pronunciation Assessment result (the SpeechServiceResponse_JsonResult of an utterance).
import type { AzureWord } from './grade.ts'

type AzureJson = {
  Duration?: number
  NBest?: {
    PronunciationAssessment?: { FluencyScore?: number }
    Words?: {
      Word: string
      Offset: number
      Duration: number
      PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string }
      Syllables?: { Offset: number; Duration: number; PronunciationAssessment?: { AccuracyScore?: number } }[]
    }[]
  }[]
}

const TICKS_PER_MS = 10_000 // Azure times are in 100 ns ticks

export type Utterance = { words: AzureWord[]; fluency: number; durationMs: number }

export function parseUtterance(raw: string): Utterance | null {
  let json: AzureJson
  try {
    json = JSON.parse(raw) as AzureJson
  } catch {
    return null
  }
  const best = json.NBest?.[0]
  if (!best) return null
  return {
    words: (best.Words ?? []).map((word) => ({
      word: word.Word,
      accuracy: word.PronunciationAssessment?.AccuracyScore ?? 0,
      errorType: word.PronunciationAssessment?.ErrorType ?? 'None',
      offset: word.Offset / TICKS_PER_MS,
      duration: word.Duration / TICKS_PER_MS,
      syllables: word.Syllables?.map((s) => ({
        accuracy: s.PronunciationAssessment?.AccuracyScore ?? 0,
        offset: s.Offset / TICKS_PER_MS,
        duration: s.Duration / TICKS_PER_MS,
      })),
    })),
    fluency: best.PronunciationAssessment?.FluencyScore ?? 0,
    durationMs: (json.Duration ?? 0) / TICKS_PER_MS,
  }
}
