// API keys live only on this device (never in the repo or the published site).
import { load, save } from './storage.ts'

export type Keys = { claude: string; azure: string; azureRegion: string }

const DEFAULTS: Keys = { claude: '', azure: '', azureRegion: 'uksouth' }

export function getKeys(): Keys {
  return { ...DEFAULTS, ...load<Partial<Keys>>('keys', {}) }
}

export function setKeys(keys: Keys): void {
  save('keys', keys)
}
