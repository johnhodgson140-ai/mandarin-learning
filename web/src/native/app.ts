// The iOS app (Capacitor) only: native helpers. On the website these report "not available" and do nothing.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { log } from '../debug/log.ts'

export const isNativeApp = () => Capacitor.isNativePlatform()

type SpeechCheckPlugin = {
  available(): Promise<{ available: boolean; onDevice: boolean }>
  recognise(options: { wav: string }): Promise<{ alternatives: string[]; segments: { text: string; start: number; duration: number }[]; error?: string }>
}
const SpeechCheck = registerPlugin<SpeechCheckPlugin>('SpeechCheck')

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** What Apple's Mandarin recogniser heard in a finished recording (best guess first); [] if nothing. */
export async function nativeRecognise(wav: Blob): Promise<string[]> {
  if (!isNativeApp()) return []
  try {
    const r = await SpeechCheck.recognise({ wav: await base64(wav) })
    log('native recogniser', { heard: r.alternatives.length, error: r.error || undefined })
    return r.alternatives.filter((a) => a.trim())
  } catch (err) {
    log('native recogniser failed', { error: String(err) })
    return []
  }
}

export async function nativeRecogniserInfo(): Promise<{ available: boolean; onDevice: boolean } | null> {
  if (!isNativeApp()) return null
  return SpeechCheck.available().catch(() => null)
}
