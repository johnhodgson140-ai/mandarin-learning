// Text-to-speech: Azure neural voice when an Azure key is set (Settings), else the device's own Chinese voice.

import { getKeys } from './keys.ts'

const VOICE = 'zh-CN-XiaoxiaoNeural'
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

/** Speak Chinese text. `rate` 0.8 = slower, 1 = normal. */
export async function speak(text: string, rate = 1): Promise<void> {
  unlockAudio()
  if (audio) {
    try {
      const blob = await nativeAudio(text, rate)
      if (blob) {
        audio.src = URL.createObjectURL(blob)
        await audio.play()
        return
      }
    } catch {
      // Fall through to the device voice.
    }
  }
  speakWithDevice(text, rate)
}

/** The Azure voice saying `text` (cached), or null without an Azure key. Also used for native pitch contours. */
export async function nativeAudio(text: string, rate = 1): Promise<Blob | null> {
  const { azure, azureRegion } = getKeys()
  if (!azure) return null
  const key = `${rate}|${text}`
  let blob = cache.get(key)
  if (!blob) {
    blob = await azureTts(text, rate, azure, azureRegion)
    cache.set(key, blob)
  }
  return blob
}

async function azureTts(text: string, rate: number, key: string, region: string): Promise<Blob> {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const percent = `${Math.round((rate - 1) * 100)}%`
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
    },
    body: `<speak version="1.0" xml:lang="zh-CN"><voice name="${VOICE}"><prosody rate="${percent}">${escaped}</prosody></voice></speak>`,
  })
  if (!res.ok) throw new Error(`Azure TTS ${res.status}`)
  return res.blob()
}

function speakWithDevice(text: string, rate: number): void {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith('zh-CN'))
  if (voice) utterance.voice = voice
  speechSynthesis.speak(utterance)
}

/** TTS speed by level: 0.8× at level 1 up to 1.1× at level 6 (docs/SPEC.md §8). */
export const rateForLevel = (level: number) => Math.round((0.8 + (level - 1) * 0.06) * 100) / 100
