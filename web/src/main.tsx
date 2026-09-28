import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { pruneRecordings } from './services/attempts.ts'
import { loadDeck } from './services/words.ts'
import { applyTheme } from './services/theme.ts'

applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask iOS not to clear the app's data (calibration, recordings, progress) when storage runs low.
void navigator.storage?.persist?.().catch(() => false)

// Recordings are kept on the device for 30 days.
pruneRecordings().catch(() => {})
// My exported Anki deck ships with the app (web/public/deck.json).
void loadDeck()
