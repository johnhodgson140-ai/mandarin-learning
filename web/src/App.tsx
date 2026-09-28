import { useEffect, useState } from 'react'
import TabBar from './components/TabBar.tsx'
import { TABS, type TabId } from './components/tabs.ts'
import Today from './screens/Today.tsx'
import Read from './screens/Read.tsx'
import Speak from './screens/Speak.tsx'
import Progress from './screens/Progress.tsx'
import './App.css'

function tabFromHash(): TabId {
  const id = window.location.hash.slice(1)
  return TABS.some((t) => t.id === id) ? (id as TabId) : 'today'
}

const SCREENS: Record<TabId, () => React.JSX.Element> = { today: Today, read: Read, speak: Speak, progress: Progress }

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const Screen = SCREENS[tab]
  return (
    <div className="app">
      <TabBar current={tab} />
      <main className="screen fade-in" key={tab}>
        <Screen />
      </main>
    </div>
  )
}
