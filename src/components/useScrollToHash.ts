import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * Scrolls to the element named by the URL's hash once the page's data has loaded. The
 * router scrolls on navigation, but local data arrives a moment later (T-0012: a search hit
 * in an entry note opens that entry).
 */
export function useScrollToHash(ready: boolean) {
  const hash = useLocation({ select: (l) => l.hash })
  useEffect(() => {
    if (ready && hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' })
  }, [ready, hash])
}
