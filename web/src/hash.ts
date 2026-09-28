import { useEffect, useState } from 'react'

/** Current location hash without '#', e.g. "read/abc123". */
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1))
  useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

export const go = (hash: string) => {
  window.location.hash = hash
}
