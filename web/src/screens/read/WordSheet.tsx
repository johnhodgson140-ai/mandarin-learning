import { useEffect, useRef, useState } from 'react'
import type { Token } from '../../chinese/tokens.ts'
import { addCard } from '../../services/anki.ts'
import { getKeys } from '../../services/keys.ts'
import { glossFor } from '../../services/gloss.ts'
import { rateForLevel, speak } from '../../services/tts.ts'

type Props = {
  token: Token
  sentence: string
  level: number
  onGloss: (word: string, english: string) => void
  onClose: () => void
}

const MASTERY_TEXT = { new: 'new', learning: 'learning', young: 'young', mature: 'mature' } as const

/** Word details: bottom sheet on the phone, right sidebar on desktop. */
export default function WordSheet({ token, sentence, level, onGloss, onClose }: Props) {
  const [gloss, setGloss] = useState(token.gloss)
  const [glossError, setGlossError] = useState<string | null>(null)
  const [ankiStatus, setAnkiStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inAnki = token.mastery !== null && token.mastery !== 'unknown'

  // Latest callback in a ref, so the lookup below runs once per word rather than on every parent render.
  const onGlossRef = useRef(onGloss)
  useEffect(() => {
    onGlossRef.current = onGloss
  })

  useEffect(() => {
    if (token.gloss || !getKeys().claude) return
    let cancelled = false
    glossFor(token.text, sentence).then(
      (english) => {
        if (cancelled) return
        setGloss(english)
        onGlossRef.current(token.text, english)
      },
      (err: unknown) => !cancelled && setGlossError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      cancelled = true
    }
  }, [token.text, token.gloss, sentence])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function addToAnki() {
    setBusy(true)
    try {
      const result = await addCard({ hanzi: token.text, pinyin: token.syllables.map((s) => s.pinyin), english: gloss })
      setAnkiStatus(
        result === 'added' ? 'Added to Anki.' : result === 'duplicate' ? 'Already in Anki.' : 'Saved. Send it to Anki with Settings → Export for Anki.',
      )
    } catch (err) {
      setAnkiStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const canAdd = true

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="word-sheet" role="dialog" aria-label={`Word: ${token.text}`}>
        <button type="button" className="sheet-close icon-btn" onClick={onClose} aria-label="Close">×</button>
        <p className="sheet-hanzi zh">{token.text}</p>
        <p className="sheet-pinyin tone-colours">
          {token.syllables.map((s, i) => (
            <span key={i} className={`t${s.written}`}>{s.pinyin}</span>
          ))}
        </p>
        <p className="sheet-gloss">
          {gloss || glossError || (getKeys().claude ? 'Looking up…' : 'Add a Claude key in Settings to look up new words.')}
        </p>
        {inAnki && <p className="muted small">In Anki · {MASTERY_TEXT[token.mastery as keyof typeof MASTERY_TEXT]}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn btn-secondary" onClick={() => speak(token.text, rateForLevel(level))}>
            ▶ Play
          </button>
          {!inAnki && token.kind === 'word' && (
            <button type="button" className="btn btn-primary" onClick={addToAnki} disabled={busy || !gloss || !canAdd}>
              + Anki
            </button>
          )}
        </div>
        {ankiStatus && <p className="muted small" role="status">{ankiStatus}</p>}
      </aside>
    </>
  )
}
