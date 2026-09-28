import { TABS, type TabId } from './tabs.ts'
import './TabBar.css'

export default function TabBar({ current }: { current: TabId }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <a key={t.id} href={`#${t.id}`} className="tab" aria-current={t.id === current ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  )
}
