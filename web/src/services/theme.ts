// Light / dark / auto (follow the device), per device.
import { load, save } from './storage.ts'

export type Theme = 'auto' | 'light' | 'dark'

export const getTheme = () => load<Theme>('theme', 'auto')

export function applyTheme(theme: Theme = getTheme()): void {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

export function setTheme(theme: Theme): void {
  save('theme', theme)
  applyTheme(theme)
}
