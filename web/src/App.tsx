import { lazy, Suspense } from 'react'
import TabBar from './components/TabBar.tsx'
import { TABS, type TabId } from './components/tabs.ts'
import { useHash } from './hash.ts'
import Today from './screens/Today.tsx'
import Speak from './screens/Speak.tsx'
import Progress from './screens/Progress.tsx'
import Settings from './screens/Settings.tsx'
import './App.css'

// Reading pulls in the Chinese dictionary and the Claude SDK: load it only when the Read tab opens.
const Read = lazy(() => import('./screens/Read.tsx'))

type ScreenId = TabId | 'settings'

const SCREENS: Record<ScreenId, React.ComponentType> = {
  today: Today,
  read: Read,
  speak: Speak,
  progress: Progress,
  settings: Settings,
}

export default function App() {
  const hash = useHash()
  const [first, second] = hash.split('/')
  const screen: ScreenId = first === 'settings' || TABS.some((t) => t.id === first) ? (first as ScreenId) : 'today'
  // The Reader is full screen: no tab bar while a story is open.
  const reading = screen === 'read' && second !== undefined && second !== 'new'
  const Screen = SCREENS[screen]
  return (
    <div className="app">
      {!reading && <TabBar current={screen === 'settings' ? 'today' : screen} />}
      <main className={`screen fade-in${reading ? ' screen-reading' : ''}`} key={hash}>
        <Suspense fallback={null}>
          <Screen />
        </Suspense>
      </main>
    </div>
  )
}
