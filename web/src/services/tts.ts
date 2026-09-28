// Text-to-speech: Azure neural voice when an Azure key is set (Settings), else the device's own Chinese voice.

import { getKeys } from './keys.ts'
import { load, save } from './storage.ts'
import { log } from '../debug/log.ts'

export type VoiceChoice = 'female' | 'male'
const AZURE_VOICES: Record<VoiceChoice, string> = { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' }
export const getVoice = (): VoiceChoice => load<VoiceChoice>('voice', 'female')
export const setVoice = (v: VoiceChoice) => save('voice', v)
const audio = typeof Audio === 'undefined' ? null : new Audio()
const cache = new Map<string, Blob>() // "rate|text" → Azure audio
let unlocked = false

/**
 * iOS only lets an <audio> element play from a user gesture. Play a silent clip on the first tap so the
 * shared element can later play Azure audio that arrives after a network request.
 */
export function unlockAudio(): void {
  if (unlocked || !audio) return
  unlocked = true
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
  audio.play().catch(() => {})
}

/** Play a recording (e.g. my own, or my voice with corrected tones) on the shared, iOS-unlocked audio element. */
export async function playBlob(blob: Blob): Promise<void> {
  unlockAudio()
  if (!audio) return
  audio.src = URL.createObjectURL(blob)
  await audio.play().catch(() => {})
}

/** Speak Chinese text. `rate` 0.8 = slower, 1 = normal. */
export async function speak(text: string, rate = 1): Promise<void> {
  unlockAudio()
  if (audio) {
    try {
      const blob = await nativeAudio(text, rate)
      if (blob) {
        audio.src = URL.createObjectURL(blob)
        await audio.play()
        log('voice: azure')
        return
      }
    } catch (err) {
      log('voice: azure failed', { error: String(err) })
      // Fall through to the device voice.
    }
  }
  speakWithDevice(text, rate)
}

/** The Azure voice saying `text` (cached), or null without an Azure key. Also used for native pitch contours. */
export async function nativeAudio(text: string, rate = 1): Promise<Blob | null> {
  const { azure, azureRegion } = getKeys()
  if (!azure) return null
  const voice = AZURE_VOICES[getVoice()]
  const key = `${voice}|${rate}|${text}`
  let blob = cache.get(key)
  if (!blob) {
    blob = await azureTts(text, rate, voice, azure, azureRegion)
    cache.set(key, blob)
  }
  return blob
}

async function azureTts(text: string, rate: number, voice: string, key: string, region: string): Promise<Blob> {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const percent = `${Math.round((rate - 1) * 100)}%`
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: `<speak version="1.0" xml:lang="zh-CN"><voice name="${voice}"><prosody rate="${percent}">${escaped}</prosody></voice></speak>`,
  })
  if (!res.ok) throw new Error(`Azure TTS ${res.status}`)
  return res.blob()
}

function speakWithDevice(text: string, rate: number): void {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  log('voice: device')
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  const voice = bestDeviceVoice()
  if (voice) utterance.voice = voice
  speechSynthesis.speak(utterance)
}

/** The clearest mainland Chinese voice installed: Premium, then Enhanced, then any (iOS lists downloads here). */
function bestDeviceVoice(): SpeechSynthesisVoice | undefined {
  const zh = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith('zh-CN'))
  const rank = (v: SpeechSynthesisVoice) => (/premium/i.test(v.name + v.voiceURI) ? 2 : /enhanced/i.test(v.name + v.voiceURI) ? 1 : 0)
  return zh.sort((a, b) => rank(b) - rank(a))[0]
}

/** Several different speakers, for ear training (many voices train the ear better than one). */
const VARIETY_AZURE = ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural', 'zh-CN-XiaochenNeural', 'zh-CN-YunyangNeural']

/** How many different voices ear training can use on this device. */
export function varietyCount(): number {
  if (getKeys().azure) return VARIETY_AZURE.length
  return Math.max(1, deviceVoices().length)
}

/** Say `text` in voice number `index` (of varietyCount()), at a slightly varied speed. */
export async function speakVariety(text: string, index: number, rate = 0.9): Promise<void> {
  unlockAudio()
  const { azure, azureRegion } = getKeys()
  if (azure && audio) {
    const voice = VARIETY_AZURE[index % VARIETY_AZURE.length]
    const key = `${voice}|${rate}|${text}`
    try {
      let blob = cache.get(key)
      if (!blob) {
        blob = await azureTts(text, rate, voice, azure, azureRegion)
        cache.set(key, blob)
      }
      audio.src = URL.createObjectURL(blob)
      await audio.play()
      return
    } catch (err) {
      log('voice: azure failed', { error: String(err) })
    }
  }
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const voices = deviceVoices()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  if (voices.length) utterance.voice = voices[index % voices.length]
  speechSynthesis.speak(utterance)
}

/** Mandarin voices on the device (mainland and Taiwan; not Cantonese). */
function deviceVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  return speechSynthesis.getVoices().filter((v) => /^zh[-_](CN|TW)/i.test(v.lang))
}

/** TTS speed by level: 0.8× at level 1 up to 1.1× at level 6 (docs/SPEC.md §8). */
export const rateForLevel = (level: number) => Math.round((0.8 + (level - 1) * 0.06) * 100) / 100
