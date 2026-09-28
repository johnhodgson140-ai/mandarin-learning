import { useEffect, useState } from 'react'
import TabBar from './components/TabBar.tsx'
import { TABS, type TabId } from './components/tabs.ts'
import Today from './screens/Today.tsx'
import Read from './screens/Read.tsx'
import Speak from './screens/Speak.tsx'
import Progress from './screens/Progress.tsx'
import Settings from './screens/Settings.tsx'
import './App.css'

type ScreenId = TabId | 'settings'

function screenFromHash(): ScreenId {
  const id = window.location.hash.slice(1)
  return id === 'settings' || TABS.some((t) => t.id === id) ? (id as ScreenId) : 'today'
}

const SCREENS: Record<ScreenId, () => React.JSX.Element> = {
  today: Today,
  read: Read,
  speak: Speak,
  progress: Progress,
  settings: Settings,
}

export default function App() {
  const [screen, setScreen] = useState<ScreenId>(screenFromHash)

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const Screen = SCREENS[screen]
  return (
    <div className="app">
      <TabBar current={screen === 'settings' ? 'today' : screen} />
      <main className="screen fade-in" key={screen}>
        <Screen />
      </main>
    </div>
  )
}
