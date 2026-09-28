// Voices on this phone: each person who practises (me, a friend) gets a named voice with their own
// calibration and learned pitch range, so tone checks fit whoever is speaking. One voice is active.

import type { SpeakerProfile } from '../tone/model.ts'
import { load, save } from './storage.ts'

export type Voice = {
  id: string
  name: string
  /** From the 30-second calibration (null until done). */
  profile: SpeakerProfile | null
  /** Pitch points learned from recent recordings, used until calibrated. */
  pitches: number[]
}

const KEY = 'voices'
const ACTIVE = 'activeVoice'
/** The phone owner's voice: the one synced with Firebase. */
export const OWNER_ID = 'me'

export function listVoices(): Voice[] {
  const stored = load<Voice[] | null>(KEY, null)
  if (stored && stored.length > 0) return stored
  // First run: move the single calibration from before voices existed into "Me".
  const me: Voice = { id: OWNER_ID, name: 'Me', profile: load<SpeakerProfile | null>('speakerProfile', null), pitches: load<number[]>('voicePitches', []) }
  save(KEY, [me])
  save('speakerProfile', null)
  save('voicePitches', null)
  return [me]
}

export function activeVoice(): Voice {
  const voices = listVoices()
  const id = load<string>(ACTIVE, OWNER_ID)
  return voices.find((v) => v.id === id) ?? voices[0]
}

/** Pitch points needed (about 5 recordings) before tones are checked without calibrating. */
export const MIN_POINTS = 200

export function voiceStatus(v: Voice): string {
  if (v.profile) return 'Calibrated'
  if (v.pitches.length >= MIN_POINTS) return 'Learned from recordings (calibrate for best results)'
  return `Not calibrated yet · learning from recordings (${Math.min(5, Math.floor(v.pitches.length / 40))} of 5)`
}

export const setActiveVoice = (id: string) => save(ACTIVE, id)

function saveVoices(voices: Voice[]) {
  save(KEY, voices)
}

export function updateVoice(id: string, patch: Partial<Omit<Voice, 'id'>>): void {
  saveVoices(listVoices().map((v) => (v.id === id ? { ...v, ...patch } : v)))
}

/** Add a voice and make it the active one. */
export function addVoice(name: string): Voice {
  const voice: Voice = { id: Date.now().toString(36), name: name.trim() || 'Friend', profile: null, pitches: [] }
  saveVoices([...listVoices(), voice])
  setActiveVoice(voice.id)
  return voice
}

export const renameVoice = (id: string, name: string) => updateVoice(id, { name: name.trim() || 'Voice' })

/** Delete a voice (never the last one); if it was active, switch to the first remaining. */
export function deleteVoice(id: string): void {
  const rest = listVoices().filter((v) => v.id !== id)
  if (rest.length === 0) return
  saveVoices(rest)
  if (load<string>(ACTIVE, OWNER_ID) === id) setActiveVoice(rest[0].id)
}
