// Hands my real Today's words to the iPhone widgets (through the App Group, WidgetBridgePlugin.swift), so the lock
// screen and home screen show exactly the words the app gives me, not a guess by date.
import { registerPlugin } from '@capacitor/core'
import { dayNumber, type Word } from '../notify/plan.ts'
import { log } from '../debug/log.ts'
import { isNativeApp } from './app.ts'

type WidgetBridgePlugin = { setWords(options: { days: Record<string, { h: string; p: string; e: string }[]> }): Promise<{ shared: boolean }> }
const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

/** `sets[d]`: the words for d days from `from` (today first). */
export async function shareWithWidgets(sets: Word[][], from = new Date()): Promise<void> {
  if (!isNativeApp()) return
  const days: Record<string, { h: string; p: string; e: string }[]> = {}
  sets.forEach((set, d) => {
    if (set.length) days[String(dayNumber(from) + d)] = set.map((w) => ({ h: w.hanzi, p: w.pinyin, e: w.english }))
  })
  try {
    const { shared } = await WidgetBridge.setWords({ days })
    log('widget words shared', { shared, days: Object.keys(days).length })
  } catch (err) {
    log('widget words failed', { error: String(err) })
  }
}
