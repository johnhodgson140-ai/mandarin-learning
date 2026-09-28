import { lazy } from 'react'
import { useHash } from '../hash.ts'
import { getProfile } from '../services/tone.ts'
import './speak/speak.css'

const Dojo = lazy(() => import('./speak/Dojo.tsx'))
const Calibrate = lazy(() => import('./speak/Calibrate.tsx'))

export default function Speak() {
  const [, sub] = useHash().split('/')
  if (sub === 'dojo') return <Dojo />
  if (sub === 'calibrate') return <Calibrate />
  return <Hub />
}

function Hub() {
  const calibrated = getProfile() !== null
  return (
    <>
      <h1>Speak</h1>
      <nav className="hub">
        <a href="#speak/dojo" className="hub-row">
          <span className="hub-title">Tone Dojo</span>
          <span className="muted">A short drill on the tone pairs you miss most.</span>
        </a>
        <a href="#speak/calibrate" className="hub-row">
          <span className="hub-title">Calibrate your voice</span>
          <span className="muted">{calibrated ? 'Done. Redo it if tone checks feel off.' : 'Four syllables, so tone checks fit your voice.'}</span>
        </a>
      </nav>
    </>
  )
}
