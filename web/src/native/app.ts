// The iOS app (Capacitor) only: native helpers. On the website these report "not available" and do nothing.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { log } from '../debug/log.ts'
import { load, save } from '../services/storage.ts'

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

// ---- Daily reminder ----

export type Reminder = { on: boolean; time: string } // "HH:MM"
const REMINDER_ID = 1
export const getReminder = () => load<Reminder>('reminder', { on: false, time: '19:00' })

/** Turn the daily practice reminder on/off (asks for notification permission the first time). */
export async function setReminder(reminder: Reminder): Promise<string | null> {
  save('reminder', reminder)
  if (!isNativeApp()) return null
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] }).catch(() => {})
  if (!reminder.on) return null
  const permission = await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') {
    save('reminder', { ...reminder, on: false })
    return 'Notifications are off for Shuō: turn them on in iPhone Settings → Notifications → Shuō.'
  }
  const [hour, minute] = reminder.time.split(':').map(Number)
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'Shuō 说',
        body: 'A few minutes of speaking today? Your cards are waiting.',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      },
    ],
  })
  return null
}
