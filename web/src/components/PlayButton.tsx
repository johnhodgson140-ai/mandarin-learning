// One play/pause button: ▶ starts (stopping anything else), ⏸ pauses, ▶ again resumes where it stopped.
import { useSyncExternalStore } from 'react'
import { playbackState, subscribePlayback, togglePlayback } from '../services/tts.ts'

export default function PlayButton({ id, label, start, className = 'chip' }: { id: string; label: string; start: () => Promise<void>; className?: string }) {
  const p = useSyncExternalStore(subscribePlayback, playbackState)
  const mine = p.id === id
  const icon = mine && p.status === 'playing' ? '⏸' : mine && p.status === 'loading' ? '…' : '▶'
  return (
    <button type="button" className={className} aria-pressed={mine && p.status !== 'idle'} onClick={() => togglePlayback(id, start)}>
      {icon} {label}{mine && p.status === 'paused' ? ' (paused)' : ''}
    </button>
  )
}
