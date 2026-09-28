// Who is practising: pick a named voice (each has its own calibration), add one, and in Settings rename/delete.
import { useState } from 'react'
import { activeVoice, addVoice, deleteVoice, listVoices, renameVoice, resetVoice, setActiveVoice, voiceStatus } from '../services/voices.ts'

export default function VoicePicker({ manage = false, onChange }: { manage?: boolean; onChange?: () => void }) {
  const [voices, setVoices] = useState(listVoices)
  const [active, setActive] = useState(() => activeVoice().id)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)

  const refresh = () => {
    setVoices(listVoices())
    setActive(activeVoice().id)
    onChange?.()
  }

  const current = voices.find((v) => v.id === active) ?? voices[0]

  return (
    <div className="voice-picker">
      <div className="chips">
        {voices.map((v) => (
          <button key={v.id} type="button" className="chip" aria-pressed={v.id === active} onClick={() => { setActiveVoice(v.id); refresh() }}>
            {v.name}
          </button>
        ))}
        {!adding && <button type="button" className="chip" onClick={() => setAdding(true)}>+ Add voice</button>}
      </div>
      {adding && (
        <form
          className="type-row"
          onSubmit={(e) => {
            e.preventDefault()
            addVoice(name)
            setName('')
            setAdding(false)
            refresh()
          }}
        >
          <input className="type-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Sam)" aria-label="Voice name" autoFocus />
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      )}
      {manage && current && (
        <div className="voice-manage">
          <p className="muted small">{current.name}: {voiceStatus(current)}</p>
          {renaming === current.id ? (
            <form
              className="type-row"
              onSubmit={(e) => {
                e.preventDefault()
                renameVoice(current.id, name)
                setName('')
                setRenaming(null)
                refresh()
              }}
            >
              <input className="type-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="New name" autoFocus />
              <button type="submit" className="btn btn-primary">Save</button>
            </form>
          ) : (
            <div className="chips">
              <a href="#speak/calibrate" className="chip">{current.profile ? 'Recalibrate' : 'Calibrate'} {current.name}</a>
              {(current.profile || current.pitches.length > 0) && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (confirm(`Reset ${current.name}'s voice? The calibration and everything learned from recordings is forgotten.`)) {
                      resetVoice(current.id)
                      refresh()
                    }
                  }}
                >
                  Reset
                </button>
              )}
              <button type="button" className="chip" onClick={() => { setName(current.name); setRenaming(current.id) }}>Rename</button>
              {voices.length > 1 && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (confirm(`Delete ${current.name}'s voice?`)) {
                      deleteVoice(current.id)
                      refresh()
                    }
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
