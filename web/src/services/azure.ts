// Azure Pronunciation Assessment (zh-CN, scripted, phoneme granularity) through Microsoft's browser SDK.
// The SDK is large, so it's only loaded the first time something is graded.

import type { AzureWord } from '../grading/grade.ts'
import { parseUtterance } from '../grading/azureJson.ts'
import { getKeys } from './keys.ts'

const TIMEOUT_MS = 30_000

/** `text`: what Azure heard, with punctuation (useful when there is no reference text). */
export type Assessment = { text: string; words: AzureWord[]; fluency: number }

/**
 * Grade a 16 kHz mono WAV against the text I was meant to say. With an empty reference it's unscripted:
 * Azure transcribes what I said and still scores the pronunciation (missions, free talk).
 */
export async function assess(wav: Blob, referenceText: string): Promise<Assessment> {
  const { azure, azureRegion } = getKeys()
  if (!azure) throw new Error('Add your Azure Speech key in Settings first.')
  const sdk = await import('microsoft-cognitiveservices-speech-sdk')

  const speechConfig = sdk.SpeechConfig.fromSubscription(azure, azureRegion)
  speechConfig.speechRecognitionLanguage = 'zh-CN'
  const stream = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1))
  stream.write((await wav.arrayBuffer()).slice(44)) // raw PCM after the 44-byte WAV header
  stream.close()
  const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromStreamInput(stream))
  new sdk.PronunciationAssessmentConfig(
    referenceText,
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    true,
  ).applyTo(recognizer)

  const words: AzureWord[] = []
  let text = ''
  let fluencyWeighted = 0
  let fluencyDuration = 0

  return new Promise<Assessment>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      recognizer.stopContinuousRecognitionAsync(
        () => recognizer.close(),
        () => recognizer.close(),
      )
      if (error) reject(error)
      else resolve({ text, words, fluency: fluencyDuration ? fluencyWeighted / fluencyDuration : 0 })
    }
    const timer = setTimeout(() => finish(new Error('Azure took too long to answer. Try again.')), TIMEOUT_MS)

    // Azure splits a paragraph into utterances at pauses: collect every one.
    recognizer.recognized = (_sender, event) => {
      if (event.result.reason !== sdk.ResultReason.RecognizedSpeech) return
      const utterance = parseUtterance(event.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult))
      if (!utterance) return
      words.push(...utterance.words)
      text += utterance.text
      const weight = utterance.durationMs || 1
      fluencyWeighted += utterance.fluency * weight
      fluencyDuration += weight
    }
    recognizer.canceled = (_sender, event) => {
      if (event.reason === sdk.CancellationReason.Error) finish(new Error(azureMessage(event.errorDetails)))
      else finish() // end of the recording
    }
    recognizer.sessionStopped = () => finish()
    recognizer.startContinuousRecognitionAsync(undefined, (e) => finish(new Error(azureMessage(e))))
  })
}

function azureMessage(details: string): string {
  if (/401|authentication|subscription/i.test(details)) return 'Your Azure key or region was rejected. Check them in Settings.'
  // Browsers hide why a WebSocket failed, so a wrong key or region also shows up as a connection error.
  if (/1006|network|websocket|connection/i.test(details))
    return "Couldn't connect to Azure. Check your internet connection, and your Azure key and region in Settings."
  if (/quota|429|throttl/i.test(details)) return 'Azure free-tier limit reached. Try again later.'
  return `Azure: ${details}`
}
