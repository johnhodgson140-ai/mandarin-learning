export const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'read', label: 'Read' },
  { id: 'speak', label: 'Speak' },
  { id: 'progress', label: 'Progress' },
] as const

export type TabId = (typeof TABS)[number]['id']
