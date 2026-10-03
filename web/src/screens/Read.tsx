import { useHash } from '../hash.ts'
import Library from './read/Library.tsx'
import NewStory from './read/NewStory.tsx'
import Reader from './read/Reader.tsx'

export default function Read() {
  const [, sub, extra] = useHash().split('/')
  if (!sub) return <Library />
  if (sub === 'new') return <NewStory />
  return <Reader id={sub} listen={extra === 'listen'} />
}
