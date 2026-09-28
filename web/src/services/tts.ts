// Text-to-speech and playback. Azure neural voice when an Azure key is set (Settings), else the device's own
// Chinese voice. Everything that makes sound goes through one player: starting something stops whatever was
// playing (nothing overlaps), and a play button can pause and resume.

import { getKeys } from './keys.ts'
import { load, save } from './storage.ts'
import { log } from '../debug/log.ts'

// ---- Settings: voice and speed ----

/** Azure voices to choose from (Settings → Voice). */
export const AZURE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao (female, warm)' },
  { id: 'zh-CN-XiaochenNeural', label: 'Xiaochen (female, calm)' },
  { id: 'zh-CN-YunxiNeural', label: 'Yunxi (male, lively)' },
  { id: 'zh-CN-YunjianNeural', label: 'Yunjian (male, deep)' },
]
export function getVoice(): string {
  const v = load<string>('voice', AZURE_VOICES[0].id)
  return v === 'male' ? 'zh-CN-YunxiNeural' : v === 'female' ? AZURE_VOICES[0].id : v // before voices had names
}
export const setVoice = (id: string) => save('voice', id)

/** The device voice I picked (voiceURI), or null for the clearest one installed. */
export const getDeviceVoice = () => load<string | null>('deviceVoice', null)
export const setDeviceVoice = (uri: string | null) => save('deviceVoice', uri)

/** Speaking speed: 'auto' follows my level (0.8× at level 1 … 1.1× at level 6), or a fixed speed like 0.8. */
export type Speed = 'auto' | number
export const SPEEDS: Speed[] = ['auto', 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2]
export const getSpeed = () => load<Speed>('speechSpeed', 'auto')
export const setSpeed = (s: Speed) => save('speechSpeed', s)
const effectiveRate = (rate: number) => {
  const s = getSpeed()
  return s === 'auto' ? rate : s
}

/** TTS speed by level: 0.8× at level 1 up to 1.1× at level 6 (docs/SPEC.md §8). */
export const rateForLevel = (level: number) => Math.round((0.8 + (level - 1) * 0.06) * 100) / 100

// ---- The one player ----

export type Playback = { id: string | null; status: 'idle' | 'loading' | 'playing' | 'paused' }
let playback: Playback = { id: null, status: 'idle' }
const listeners = new Set<(p: Playback) => void>()
let token = 0 // bumped on every start/stop, so a slow Azure request can't start after something newer

function set(p: Playback) {
  playback = p
  listeners.forEach((l) => l(p))
}
export const playbackState = () => playback
export function subscribePlayback(listener: (p: Playback) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const audio = typeof Audio === 'undefined' ? null : new Audio()
let usingDevice = false
if (audio) {
  audio.addEventListener('ended', () => set({ id: null, status: 'idle' }))
  audio.addEventListener('pause', () => {
    if (!audio.ended && playback.status === 'playing' && !usingDevice) set({ ...playback, status: 'paused' })
  })
  audio.addEventListener('play', () => {
    if (playback.status === 'paused' && !usingDevice) set({ ...playback, status: 'playing' })
  })
}
let unlocked = false

/**
 * iOS only lets an <audio> element play from a user gesture. Play a silent clip on the first tap so the
 * shared element can later play audio that arrives after a network request.
 */
export function unlockAudio(): void {
  if (unlocked || !audio) return
  unlocked = true
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
  audio.play().catch(() => {})
}

/** Stop anything playing. */
export function stopPlayback(): void {
  token++
  audio?.pause()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  set({ id: null, status: 'idle' })
}

/**
 * Play/pause button behaviour: tapping what's playing pauses it, tapping it again resumes where it stopped,
 * tapping anything else stops the old sound and starts the new one.
 */
export function togglePlayback(id: string, start: () => Promise<void>): void {
  if (playback.id === id && playback.status === 'playing') {
    if (usingDevice) speechSynthesis.pause()
    else audio?.pause()
    set({ id, status: 'paused' })
    return
  }
  if (playback.id === id && playback.status === 'paused') {
    if (usingDevice) speechSynthesis.resume()
    else void audio?.play().catch(() => {})
    set({ id, status: 'playing' })
    return
  }
  void start()
}

async function playAudio(blob: Blob, id: string, mine: number): Promise<void> {
  if (!audio || mine !== token) return
  usingDevice = false
  audio.src = URL.createObjectURL(blob)
  set({ id, status: 'playing' })
  await audio.play().catch(() => set({ id: null, status: 'idle' }))
}

function playDevice(text: string, rate: number, id: string, voice?: SpeechSynthesisVoice) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  usingDevice = true
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = rate
  const v = voice ?? chosenDeviceVoice()
  if (v) utterance.voice = v
  utterance.onend = () => playback.id === id && set({ id: null, status: 'idle' })
  set({ id, status: 'playing' })
  speechSynthesis.speak(utterance)
}

/** Play a recording (mine, or my voice with corrected tones). */
export async function playBlob(blob: Blob, id = 'recording'): Promise<void> {
  unlockAudio()
  stopPlayback()
  await playAudio(blob, id, token)
}

/** Speak Chinese text. `rate` 0.8 = slower, 1 = normal (overridden by a fixed speed in Settings). */
export async function speak(text: string, rate = 1, id = `say:${text}`): Promise<void> {
  unlockAudio()
  stopPlayback()
  const mine = token
  const r = effectiveRate(rate)
  if (getKeys().azure) {
    set({ id, status: 'loading' })
    try {
      const blob = await nativeAudio(text, r)
      if (blob) {
        log('voice: azure')
        return playAudio(blob, id, mine)
      }
    } catch (err) {
      log('voice: azure failed', { error: String(err) })
    }
    if (mine !== token) return
  }
  log('voice: device')
  playDevice(text, r, id)
}

// ---- Azure ----

const cache = new Map<string, Blob>() // "voice|rate|text" → Azure audio

/** The Azure voice saying `text` (cached), or null without an Azure key. Also used for native pitch contours. */
export async function nativeAudio(text: string, rate = 1): Promise<Blob | null> {
  const { azure, azureRegion } = getKeys()
  if (!azure) return null
  const voice = getVoice()
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
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
    },
    body: `<speak version="1.0" xml:lang="zh-CN"><voice name="${voice}"><prosody rate="${percent}">${escaped}</prosody></voice></speak>`,
  })
  if (!res.ok) throw new Error(`Azure TTS ${res.status}`)
  return res.blob()
}

// ---- Device voices ----

/** Mandarin voices on the device (mainland and Taiwan; not Cantonese), clearest first. */
export function deviceVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const rank = (v: SpeechSynthesisVoice) => (/premium/i.test(v.name + v.voiceURI) ? 2 : /enhanced/i.test(v.name + v.voiceURI) ? 1 : 0)
  const mainland = (v: SpeechSynthesisVoice) => (/^zh[-_]CN/i.test(v.lang) ? 1 : 0)
  return speechSynthesis
    .getVoices()
    .filter((v) => /^zh[-_](CN|TW)/i.test(v.lang))
    .sort((a, b) => rank(b) - rank(a) || mainland(b) - mainland(a))
}

/** The voice I picked, else the clearest mainland voice installed (Premium, then Enhanced). */
function chosenDeviceVoice(): SpeechSynthesisVoice | undefined {
  const voices = deviceVoices()
  const picked = getDeviceVoice()
  return voices.find((v) => v.voiceURI === picked) ?? voices.find((v) => /^zh[-_]CN/i.test(v.lang)) ?? voices[0]
}

// ---- Ear training: many voices ----

/** Several different speakers, for ear training (many voices train the ear better than one). */
const VARIETY_AZURE = ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural', 'zh-CN-XiaochenNeural', 'zh-CN-YunyangNeural']

/** How many different voices ear training can use on this device. */
export function varietyCount(): number {
  if (getKeys().azure) return VARIETY_AZURE.length
  return Math.max(1, deviceVoices().length)
}

/** Say `text` in voice number `index` (of varietyCount()), at a slightly varied speed around my speed setting. */
export async function speakVariety(text: string, index: number, rate = 0.9): Promise<void> {
  unlockAudio()
  stopPlayback()
  const mine = token
  const id = `ear:${text}:${index}`
  const s = getSpeed()
  const r = s === 'auto' ? rate : Math.round(s * (0.95 + Math.random() * 0.1) * 100) / 100
  const { azure, azureRegion } = getKeys()
  if (azure && audio) {
    const voice = VARIETY_AZURE[index % VARIETY_AZURE.length]
    const key = `${voice}|${r}|${text}`
    try {
      set({ id, status: 'loading' })
      let blob = cache.get(key)
      if (!blob) {
        blob = await azureTts(text, r, voice, azure, azureRegion)
        cache.set(key, blob)
      }
      return playAudio(blob, id, mine)
    } catch (err) {
      log('voice: azure failed', { error: String(err) })
    }
    if (mine !== token) return
  }
  const voices = deviceVoices()
  playDevice(text, r, id, voices.length ? voices[index % voices.length] : undefined)
}
