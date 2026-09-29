// Local notifications (iOS app): word of the day, practice reminder with the cards due, streak saver.
// Rescheduled whenever the app opens, after each practice, and when the settings change.
import { LocalNotifications } from '@capacitor/local-notifications'
import { buildParagraph } from '../chinese/tokens.ts'
import { log } from '../debug/log.ts'
import { weakest, type EarStats } from '../ears/logic.ts'
import { DEFAULT_NOTIFY, IDS, planNotifications, type NotifySettings, type Word } from '../notify/plan.ts'
import { activeDays, dayKey } from '../progress/logic.ts'
import { dueCounts } from '../services/cards.ts'
import { gatherActivity } from '../services/progress.ts'
import { load, save } from '../services/storage.ts'
import { getLexicon } from '../services/words.ts'
import { isNativeApp } from './app.ts'

export function getNotifySettings(): NotifySettings {
  const saved = load<NotifySettings | null>('notifications', null)
  if (saved) return { ...DEFAULT_NOTIFY, ...saved }
  // Before these settings existed there was one daily reminder: keep it as the practice reminder.
  const old = load<{ on: boolean; time: string } | null>('reminder', null)
  return old ? { ...DEFAULT_NOTIFY, practice: old } : DEFAULT_NOTIFY
}

/** Save settings and reschedule. Returns a problem to show (notifications not allowed), or null. */
export async function setNotifySettings(settings: NotifySettings): Promise<string | null> {
  save('notifications', settings)
  if (!isNativeApp()) return null
  const anyOn = settings.wordOfDay.on || settings.practice.on || settings.streak.on
  if (anyOn) {
    const permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') {
      save('notifications', { wordOfDay: { ...settings.wordOfDay, on: false }, practice: { ...settings.practice, on: false }, streak: { ...settings.streak, on: false } })
      await refreshNotifications()
      return 'Notifications are off for Shuō: turn them on in iPhone Settings → Notifications → Shuō.'
    }
  }
  await refreshNotifications()
  return null
}

/** My deck words with pinyin and meaning, for the word of the day. */
function words(): Word[] {
  const lexicon = getLexicon()
  return [...lexicon]
    .filter(([hanzi, e]) => e.english && [...hanzi].length <= 4)
    .map(([hanzi, e]) => ({ hanzi, pinyin: buildParagraph([hanzi], lexicon)[0]?.syllables.map((s) => s.pinyin).join('') ?? '', english: e.english.split(/[;,]/)[0].trim() }))
}

function toneTip(): string | null {
  const worst = weakest(load<EarStats>('earStats', {}), 1)[0]
  return worst ? `Tone tip: ${worst.pattern.replace('-', ' + ')} is your trickiest (${Math.round(worst.accuracy * 100)}% in Tone ears).` : null
}

export async function refreshNotifications(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const all = [...Array(7).keys()].flatMap((d) => [IDS.practice + d, IDS.wordOfDay + d]).concat(IDS.streak, 1 /* the old reminder */)
    await LocalNotifications.cancel({ notifications: all.map((id) => ({ id })) })
    const { activity } = await gatherActivity()
    const plan = planNotifications({
      now: new Date(),
      settings: getNotifySettings(),
      dueCount: dueCounts().learn + dueCounts().recall,
      practisedToday: activeDays(activity).has(dayKey(Date.now())),
      words: words(),
      toneTip: toneTip(),
    })
    if (plan.length)
      await LocalNotifications.schedule({
        notifications: plan.map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true }, extra: { route: p.route } })),
      })
    log('notifications scheduled', { count: plan.length })
  } catch (err) {
    log('notifications failed', { error: String(err) })
  }
}

/** Tapping a notification opens the screen it's about. */
export function listenForNotificationTaps(): void {
  if (!isNativeApp()) return
  void LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const route = (notification.extra as { route?: string } | undefined)?.route
    if (route) location.hash = route
  })
}
