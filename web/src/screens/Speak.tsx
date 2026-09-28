import { lazy } from 'react'
import { useHash } from '../hash.ts'
import { getProfile } from '../services/tone.ts'
import './speak/speak.css'

const Dojo = lazy(() => import('./speak/Dojo.tsx'))
const Calibrate = lazy(() => import('./speak/Calibrate.tsx'))
const Missions = lazy(() => import('./speak/Missions.tsx'))
const Cards = lazy(() => import('./speak/Cards.tsx'))
const Guided = lazy(() => import('./speak/Guided.tsx'))
const Mission = lazy(() => import('./speak/Mission.tsx'))

export default function Speak() {
  const [, sub, arg] = useHash().split('/')
  if (sub === 'dojo') return <Dojo />
  if (sub === 'calibrate') return <Calibrate />
  if (sub === 'missions') return <Missions />
  if (sub === 'cards') return <Cards />
  if (sub === 'guided' && arg) return <Guided id={arg} />
  if (sub === 'mission' && arg) return <Mission scenarioId={arg} />
  if (sub === 'free') return <Mission scenarioId="free" />
  return <Hub />
}

function Hub() {
  const calibrated = getProfile() !== null
  return (
    <>
      <h1>Speak</h1>
      <nav className="hub">
        <a href="#speak/cards" className="hub-row">
          <span className="hub-title">Say your cards</span>
          <span className="muted">Flashcards you answer out loud, scored 1–100.</span>
        </a>
        <a href="#speak/dojo" className="hub-row">
          <span className="hub-title">Tone Dojo</span>
          <span className="muted">A short drill on the tone pairs you miss most.</span>
        </a>
        <a href="#speak/missions" className="hub-row">
          <span className="hub-title">Missions</span>
          <span className="muted">Role-play real situations: order food, bargain, message a seller.</span>
        </a>
        <a href="#speak/free" className="hub-row">
          <span className="hub-title">Free Talk</span>
          <span className="muted">An open chat with a friendly partner at your level.</span>
        </a>
        <a href="#speak/calibrate" className="hub-row">
          <span className="hub-title">Calibrate your voice</span>
          <span className="muted">{calibrated ? 'Done. Redo it if tone checks feel off.' : 'Four syllables, so tone checks fit your voice.'}</span>
        </a>
      </nav>
    </>
  )
}
