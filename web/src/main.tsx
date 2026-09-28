import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { startLogging } from './debug/log.ts'
import { pruneRecordings } from './services/attempts.ts'
import { loadDaily } from './services/daily.ts'
import { loadDeck } from './services/words.ts'
import { applyTheme } from './services/theme.ts'

applyTheme()
startLogging()

// Updates: check for a new version whenever the app is opened; when one is found it installs and the page
// reloads onto it straight away (so the home-screen app never keeps running an old copy).
if (import.meta.env.MODE !== 'native') registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => {})
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask iOS not to clear the app's data (calibration, recordings, progress) when storage runs low.
void navigator.storage?.persist?.().catch(() => false)

// Recordings are kept on the device for 30 days.
pruneRecordings().catch(() => {})
// Today's stories and missions, whichever screen the app opens on.
void loadDaily()
// My exported Anki deck ships with the app (web/public/deck.json).
void loadDeck()
