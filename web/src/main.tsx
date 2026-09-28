import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.tsx'
import { pruneRecordings } from './services/attempts.ts'
import { loadDeck } from './services/words.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Recordings are kept on the device for 30 days.
pruneRecordings().catch(() => {})
// My exported Anki deck ships with the app (web/public/deck.json).
void loadDeck()
